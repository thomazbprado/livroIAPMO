"""Execução de prompts: validação, verificação numérica, chamada ao modelo, conferência e cobrança.

A execução é assíncrona: `inicia` valida tudo e cria o registro (em_andamento); uma tarefa em
segundo plano chama o provedor e finaliza o registro. O cliente consulta o andamento por
GET /v1/execucoes/{id}.
"""
from __future__ import annotations

import logging
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import billing
from .catalog import plano, pode_ver_prompt
from .config import TAXONOMIA, settings
from .db import session_scope
from .deps import Ctx
from .engine import llm, render, verify
from .models import Execution, Validation, agora
from .ratelimit import limitador
from .security import decifra

log = logging.getLogger("iapm.runner")
APP_VERSION = "1.0.0"
_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="iapm-exec")

DECISOES = {"aprovada", "aprovada_com_ressalvas", "rejeitada"}


class ErroCampos(Exception):
    def __init__(self, erros: dict[str, str]):
        super().__init__("Dados inválidos")
        self.erros = erros


@dataclass
class Pedido:
    variaveis: dict[str, Any]
    classificacao: str
    finalidade: str = ""
    projeto_ref: str = ""
    fonte_ia: str | None = None  # creditos | byok | simulado | None (automático)
    nivel_modelo: str | None = None
    extras: dict = field(default_factory=dict)


def _fonte_automatica(db: Session, ctx: Ctx, nivel_id: str) -> str:
    if ctx.org.byok_key_enc:
        return "byok"
    if settings.anthropic_api_key and billing.saldo(db, ctx.org.id) > 0:
        return "creditos"
    return "simulado"


def preview(db: Session, ctx: Ctx, prompt: dict, variaveis: dict, nivel_id: str | None) -> dict:
    """Valida os dados, calcula as verificações possíveis e estima o custo, sem executar nada.

    Aceita formulário incompleto: devolve `valido: false` e os erros por campo, e calcula as
    verificações com os campos que já estão válidos."""
    valores, erros = render.valida_parcial(prompt["variaveis"], variaveis)
    resultados = verify.calcula_verificacoes(prompt, valores)
    nivel_id = nivel_id or prompt.get("modelo_recomendado", "avancado")
    tokens_in = render.estima_tokens(str(prompt["rctif"]) + str(valores)) + 700
    out = {
        "valido": not erros, "campos": erros,
        "verificacoes": [r.como_dict() for r in resultados],
        "estimativa": llm.estimativa(nivel_id, tokens_in, prompt.get("saida_tokens_estimados", 7000)),
        "nivel_modelo": nivel_id, "modelo": llm.nivel(nivel_id)["modelo"], "prompt_pronto": None,
    }
    if not erros:
        system, user = render.monta_mensagens(prompt, valores, resultados)
        schema = render.schema_saida(verify.ids_verificacao(prompt, resultados))
        out["prompt_pronto"] = render.prompt_para_copiar(prompt, valores, resultados)
        out["estimativa"] = llm.estimativa(nivel_id, render.estima_tokens(system + user + str(schema)), prompt.get("saida_tokens_estimados", 7000))
    return out


def _valida(prompt: dict, variaveis: dict) -> dict:
    try:
        return render.valida_variaveis(prompt["variaveis"], variaveis)
    except render.ErroVariaveis as e:
        raise ErroCampos(e.erros) from e


def inicia(db: Session, ctx: Ctx, prompt: dict, pedido: Pedido) -> tuple[Execution, Future | None]:
    p = plano(billing.plano_efetivo(db, ctx.org)["id"])
    if ctx.canal == "api" and not p["api"]:
        raise billing.ErroNegocio("api_indisponivel", f"O plano {p['nome']} não inclui acesso por API.", 403)
    if not pode_ver_prompt(p["id"], prompt):
        raise billing.ErroNegocio("prompt_bloqueado", "Este prompt está disponível a partir do nível Leitor.", 403)
    if not limitador.permite(f"exec:{ctx.org.id}", p["rate_limit_min"]):
        raise billing.ErroNegocio("limite_taxa", "Muitas execuções em pouco tempo. Aguarde um minuto.", 429)

    classes = {c["id"]: c for c in TAXONOMIA["classificacao_dados"]}
    if pedido.classificacao not in classes:
        raise billing.ErroNegocio("classificacao_obrigatoria", "Informe a classificação dos dados (pública, interna, confidencial ou restrita).", 422)

    nivel_id = pedido.nivel_modelo or prompt.get("modelo_recomendado", "avancado")
    try:
        llm.nivel(nivel_id)
    except ValueError:
        raise billing.ErroNegocio("nivel_invalido", "Nível de modelo inválido.", 422) from None
    fonte = pedido.fonte_ia or _fonte_automatica(db, ctx, nivel_id)
    if fonte not in ("creditos", "byok", "simulado"):
        raise billing.ErroNegocio("fonte_invalida", "Fonte de IA inválida.", 422)

    # Porta de classificação de dados: dados restritos não vão para IA, salvo política explícita com chave própria.
    if pedido.classificacao == "restrita":
        liberado = fonte == "byok" and bool((ctx.org.politica or {}).get("permitir_restrita_byok"))
        if fonte != "simulado" and not liberado:
            raise billing.ErroNegocio(
                "dados_restritos",
                "Dados classificados como restritos não podem ser enviados à IA. Anonimize ou remova as informações restritas.",
                422,
            )

    valores = _valida(prompt, pedido.variaveis)
    resultados = verify.calcula_verificacoes(prompt, valores)
    system, user = render.monta_mensagens(prompt, valores, resultados)
    schema = render.schema_saida(verify.ids_verificacao(prompt, resultados))
    tokens_in = render.estima_tokens(system + user + str(schema))
    est = llm.estimativa(nivel_id, tokens_in, prompt.get("saida_tokens_estimados", 7000))

    chave: str | None = None
    if fonte == "byok":
        if not p["byok"]:
            raise billing.ErroNegocio("byok_indisponivel", "O plano atual não permite chave própria.", 403)
        if not ctx.org.byok_key_enc:
            raise billing.ErroNegocio("byok_ausente", "Cadastre a sua chave de API em Plano e uso antes de executar com chave própria.", 422)
        chave = decifra(ctx.org.byok_key_enc)
        if not chave:
            raise billing.ErroNegocio("byok_ilegivel", "Não foi possível ler a chave cadastrada. Cadastre-a novamente.", 422)
    elif fonte == "creditos":
        if not settings.anthropic_api_key:
            raise billing.ErroNegocio("creditos_indisponiveis", "Os créditos gerenciados não estão disponíveis neste ambiente. Use a sua chave ou o modo demonstração.", 503)
        sd = billing.saldo(db, ctx.org.id)
        if sd < est["creditos"]:
            raise billing.ErroNegocio("saldo_insuficiente", f"Saldo insuficiente: a execução estimada custa cerca de {est['creditos']} créditos e o saldo é {sd}.", 402)
        chave = settings.anthropic_api_key

    modelo_nome = llm.nivel(nivel_id)["modelo"] if fonte != "simulado" else "simulado"
    ex = Execution(
        org_id=ctx.org.id, user_id=ctx.user.id, prompt_id=prompt["id"], prompt_versao=prompt["versao"],
        prompt_titulo=prompt["titulo"], status="em_andamento", etapa="verificando_numeros", fonte_ia=fonte,
        nivel_modelo=nivel_id, modelo=modelo_nome, classificacao_dados=pedido.classificacao,
        finalidade=(pedido.finalidade or prompt.get("decisao_apoiada", ""))[:300],
        projeto_ref=pedido.projeto_ref[:200], canal=ctx.canal, variaveis=valores,
        prompt_renderizado=f"[SISTEMA]\n{system}\n\n[USUÁRIO]\n{user}",
        verificacoes=[r.como_dict() for r in resultados],
    )
    db.add(ex)
    db.commit()

    futuro = _pool.submit(_executa, ex.id, prompt, valores, resultados, system, user, schema, fonte, chave, nivel_id)
    return ex, futuro


def _atualiza_etapa(exec_id: str, etapa: str) -> None:
    with session_scope() as db:
        ex = db.get(Execution, exec_id)
        if ex:
            ex.etapa = etapa


def _executa(exec_id, prompt, valores, resultados, system, user, schema, fonte, chave, nivel_id) -> None:
    try:
        _atualiza_etapa(exec_id, "consultando_modelo")
        if fonte == "simulado":
            resp = llm.SimuladoProvider().executa(prompt, valores, resultados, render.renderiza_blocos(prompt, valores))
        else:
            resp = llm.AnthropicProvider(chave).executa(system, user, schema, nivel_id, prompt.get("esforco"))
        _atualiza_etapa(exec_id, "conferindo_numeros")
        conferencia = verify.confere(resultados, resp.saida.get("valores_reportados", []))
        custo = 0.0 if fonte == "simulado" else llm.custo_usd(nivel_id, resp.tokens_in, resp.tokens_out)
        with session_scope() as db:
            ex = db.get(Execution, exec_id)
            ex.saida = resp.saida
            ex.conferencia = conferencia
            ex.tokens_in, ex.tokens_out = resp.tokens_in, resp.tokens_out
            ex.modelo = resp.modelo
            ex.request_id = resp.request_id
            ex.custo_usd = round(custo, 6)
            if fonte == "creditos":
                cred = llm.creditos_de(custo)
                ex.creditos_cobrados = cred
                billing.lanca(db, ex.org_id, -cred, "consumo", ex.id, f"Execução: {ex.prompt_titulo}")
            ex.status, ex.etapa, ex.concluido_em = "concluida", "concluida", agora()
    except llm.ErroIA as e:
        log.warning("execução %s falhou: %s (%s)", exec_id, e.codigo, e.detalhe[:200])
        msg = e.mensagem
        if fonte == "creditos" and e.codigo in ("chave_invalida", "sem_permissao", "saldo_provedor"):
            # Problema na chave da plataforma: não é culpa nem responsabilidade do usuário. Alerta operacional no log.
            log.error("CHAVE DA PLATAFORMA com problema (%s). Verifique ANTHROPIC_API_KEY e o saldo no provedor.", e.codigo)
            msg = "O serviço de IA da plataforma está temporariamente indisponível. Tente novamente mais tarde ou use a sua chave própria."
        _marca_erro(exec_id, msg)
    except Exception:  # noqa: BLE001
        log.exception("erro inesperado na execução %s", exec_id)
        _marca_erro(exec_id, "Erro interno ao processar a execução. Nenhum crédito foi cobrado.")


def _marca_erro(exec_id: str, msg: str) -> None:
    with session_scope() as db:
        ex = db.get(Execution, exec_id)
        if ex:
            ex.status, ex.etapa, ex.erro, ex.concluido_em = "erro", "erro", msg, agora()


def marca_interrompidas() -> int:
    """No início do processo, execuções que ficaram em andamento são encerradas como erro."""
    with session_scope() as db:
        pend = db.scalars(select(Execution).where(Execution.status == "em_andamento")).all()
        for ex in pend:
            ex.status, ex.etapa, ex.concluido_em = "erro", "erro", agora()
            ex.erro = "Execução interrompida por reinício do serviço. Nenhum crédito foi cobrado. Execute novamente."
        return len(pend)


# ----------------------------------------------------------------- validação humana
def registra_validacao(db: Session, ctx: Ctx, ex: Execution, prompt: dict | None, dados: dict) -> Validation:
    if ex.status != "concluida":
        raise billing.ErroNegocio("execucao_incompleta", "Só é possível validar uma execução concluída.", 409)
    decisao = dados.get("decisao")
    if decisao not in DECISOES:
        raise billing.ErroNegocio("decisao_invalida", "Decisão inválida.", 422)
    nome = (dados.get("validador_nome") or "").strip()
    papel = (dados.get("validador_papel") or "").strip()
    if not nome or not papel:
        raise billing.ErroNegocio("validador_obrigatorio", "Informe o nome e o papel de quem valida.", 422)
    just = (dados.get("justificativa") or "").strip()
    diverge = [c for c in (ex.conferencia or []) if c["status"] == "diverge"]
    if decisao != "aprovada" and len(just) < 10:
        raise billing.ErroNegocio("justificativa_obrigatoria", "Explique a decisão (ao menos 10 caracteres).", 422)
    if decisao == "aprovada" and diverge and len(just) < 10:
        raise billing.ErroNegocio(
            "divergencia_numerica",
            "Há números do modelo que divergem do cálculo por código. Justifique a aprovação ou use aprovada com ressalvas.", 422,
        )
    checklist = dados.get("checklist") or []
    if decisao == "aprovada" and (not checklist or not all(bool(i.get("ok")) for i in checklist)):
        raise billing.ErroNegocio(
            "checklist_incompleto",
            "Para aprovar sem ressalvas, confirme todos os itens do checklist de validação.", 422,
        )
    v = Validation(
        execution_id=ex.id, user_id=ctx.user.id, decisao=decisao, validador_nome=nome[:200], validador_papel=papel[:120],
        checklist=[{"item": str(i.get("item", ""))[:300], "ok": bool(i.get("ok"))} for i in checklist][:30],
        justificativa=just[:4000], instancia_decisoria=(dados.get("instancia_decisoria") or "")[:200],
        condicionantes=(dados.get("condicionantes") or "")[:4000],
    )
    db.add(v)
    db.flush()
    return v
