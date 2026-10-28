from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import billing, runner
from ..catalog import catalogo, pode_ver_prompt, visao_publica
from ..config import MODELOS, TAXONOMIA
from ..db import get_db
from ..deps import Ctx, contexto
from ..engine import llm
from ..models import Lead
from ..schemas import ExecutarIn, PreviaIn, SugestaoIn
from .execucoes import exec_dict

router = APIRouter(prefix="/v1", tags=["catálogo"])


def _resumo(p: dict, acesso: bool) -> dict:
    return {
        "id": p["id"], "titulo": p["titulo"], "versao": p["versao"], "setor": p["setor"], "fase": p["fase"],
        "disciplinas": p["disciplinas"], "resumo": p["resumo"], "decisao_apoiada": p.get("decisao_apoiada", ""),
        "classificacao_risco_uso": p.get("classificacao_risco_uso", "medio"), "nivel_minimo": p.get("nivel_minimo", 1),
        "origem": p.get("origem"), "acesso": acesso,
    }


@router.get("/catalogo")
def get_catalogo():
    """Visão pública do catálogo (taxonomia, cobertura e resumos). Não expõe o texto dos prompts."""
    c = catalogo()
    return {
        "taxonomia": TAXONOMIA,
        "modelos": [{k: v for k, v in n.items() if k not in ("preco_in_usd_mtok", "preco_out_usd_mtok")} for n in MODELOS["niveis"]],
        "matriz": c.matriz(),
        "cobertura": c.cobertura(),
        "prompts": [_resumo(p, p.get("nivel_minimo", 1) == 0) for p in c.lista()],
    }


@router.get("/prompts")
def lista_prompts(setor: str | None = None, fase: str | None = None, disciplina: str | None = None,
                  q: str | None = Query(default=None, max_length=100),
                  ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    plano_id = billing.plano_efetivo(db, ctx.org)["id"]
    itens = catalogo().lista(setor, fase, disciplina, q)
    return {"total": len(itens), "prompts": [_resumo(p, pode_ver_prompt(plano_id, p)) for p in itens]}


def _prompt_ou_404(prompt_id: str) -> dict:
    p = catalogo().get(prompt_id)
    if p is None:
        raise HTTPException(404, "Prompt não encontrado.")
    return p


@router.get("/prompts/{prompt_id}")
def get_prompt(prompt_id: str, ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    p = _prompt_ou_404(prompt_id)
    plano_id = billing.plano_efetivo(db, ctx.org)["id"]
    return visao_publica(p, pode_ver_prompt(plano_id, p))


def _exige_acesso(db: Session, ctx: Ctx, p: dict) -> None:
    plano_id = billing.plano_efetivo(db, ctx.org)["id"]
    if not pode_ver_prompt(plano_id, p):
        raise HTTPException(403, "Este prompt está disponível a partir do nível Leitor.")


@router.post("/prompts/{prompt_id}/previa")
def previa(prompt_id: str, body: PreviaIn, ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    """Valida os dados, calcula as verificações e estima o custo, sem chamar o modelo."""
    p = _prompt_ou_404(prompt_id)
    _exige_acesso(db, ctx, p)
    try:
        return runner.preview(db, ctx, p, body.variaveis, body.nivel_modelo)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@router.post("/prompts/{prompt_id}/renderizar")
def renderizar(prompt_id: str, body: PreviaIn, ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    """Devolve o prompt pronto (formato RCTIF) para colar em qualquer ferramenta de IA."""
    p = _prompt_ou_404(prompt_id)
    _exige_acesso(db, ctx, p)
    r = runner.preview(db, ctx, p, body.variaveis, body.nivel_modelo)
    if not r["valido"]:
        raise HTTPException(422, {"mensagem": "Corrija os campos destacados.", "campos": r["campos"]})
    return {"prompt": r["prompt_pronto"], "verificacoes": r["verificacoes"]}


@router.post("/prompts/{prompt_id}/executar", status_code=202)
def executar(prompt_id: str, body: ExecutarIn, ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    p = _prompt_ou_404(prompt_id)
    pedido = runner.Pedido(
        variaveis=body.variaveis, classificacao=body.classificacao_dados, finalidade=body.finalidade,
        projeto_ref=body.projeto_ref, fonte_ia=body.fonte_ia, nivel_modelo=body.nivel_modelo,
    )
    try:
        ex, futuro = runner.inicia(db, ctx, p, pedido)
    except runner.ErroCampos as e:
        raise HTTPException(422, {"mensagem": "Corrija os campos destacados.", "campos": e.erros}) from e
    except billing.ErroNegocio as e:
        raise HTTPException(e.status, {"codigo": e.codigo, "mensagem": e.mensagem}) from e
    if body.aguardar and futuro is not None:
        try:
            futuro.result(timeout=600)
        except Exception:  # noqa: BLE001  (o erro já foi gravado na execução)
            pass
        db.expire_all()
        ex = db.get(type(ex), ex.id)
    return exec_dict(ex, completo=True)


@router.get("/modelos/estimativa")
def estimativa_rapida(prompt_id: str, nivel: str, ctx: Ctx = Depends(contexto)):
    p = _prompt_ou_404(prompt_id)
    try:
        return llm.estimativa(nivel, 3500, p.get("saida_tokens_estimados", 7000))
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@router.post("/sugestoes", status_code=201)
def sugerir_prompt(body: SugestaoIn, ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    """Registra o pedido de um prompt para uma combinação setor x fase ainda sem cobertura."""
    setores = {s["id"]: s["nome"] for s in TAXONOMIA["setores"]}
    fases = {f["id"]: f["nome"] for f in TAXONOMIA["fases"]}
    if body.setor not in setores or body.fase not in fases:
        raise HTTPException(422, "Setor ou fase inválidos.")
    db.add(Lead(
        tipo="prompt_sugerido", org_id=ctx.org.id, nome=ctx.user.nome, email=ctx.user.email, empresa=ctx.org.nome,
        servico_id=f"{body.setor}.{body.fase}", mensagem=f"[{setores[body.setor]} / {fases[body.fase]}] {body.descricao}",
    ))
    db.commit()
    return {"ok": True}
