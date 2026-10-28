"""Provedores de IA, custo e conversão em créditos.

Há dois provedores:
- AnthropicProvider: chama a API da Anthropic pelo SDK oficial (chave gerenciada ou BYOK).
- SimuladoProvider: modo demonstração, sem custo e sem chamada externa. Usa os dados do
  usuário e os números calculados por código para mostrar a estrutura da entrega.
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field

import anthropic

from ..config import MODELOS, PLANOS, settings


class ErroIA(Exception):
    """Falha da chamada ao modelo, com mensagem segura para exibir ao usuário."""

    def __init__(self, codigo: str, mensagem: str, detalhe: str = ""):
        super().__init__(mensagem)
        self.codigo = codigo
        self.mensagem = mensagem
        self.detalhe = detalhe


@dataclass
class RespostaIA:
    saida: dict
    tokens_in: int
    tokens_out: int
    modelo: str
    request_id: str | None = None
    usou_fallback: bool = False
    extras: dict = field(default_factory=dict)


# ----------------------------------------------------------------- níveis, custo e créditos
def nivel(nivel_id: str | None) -> dict:
    alvo = nivel_id or MODELOS["nivel_padrao"]
    for n in MODELOS["niveis"]:
        if n["id"] == alvo:
            return n
    raise ValueError(f"nível de modelo desconhecido: {nivel_id}")


def custo_usd(nivel_id: str, tokens_in: int, tokens_out: int) -> float:
    n = nivel(nivel_id)
    return tokens_in / 1e6 * n["preco_in_usd_mtok"] + tokens_out / 1e6 * n["preco_out_usd_mtok"]


def creditos_de(custo_usd_: float) -> int:
    """Converte o custo do provedor em créditos cobrados, aplicando a margem-alvo do plano.

    créditos = custo em R$ / (1 - margem) / preço de referência de um crédito.
    """
    if custo_usd_ <= 0:
        return 0
    brl = custo_usd_ * settings.usd_brl
    preco = PLANOS["credito_preco_referencia_brl"] / 1.0
    return max(1, math.ceil(brl / (1 - PLANOS["margem_alvo"]) / preco))


def estimativa(nivel_id: str, tokens_in: int, tokens_out: int) -> dict:
    c = custo_usd(nivel_id, tokens_in, tokens_out)
    # Faixa: a saída real costuma variar bastante com o esforço de raciocínio do modelo.
    c_min = custo_usd(nivel_id, tokens_in, int(tokens_out * 0.6))
    c_max = custo_usd(nivel_id, tokens_in, int(tokens_out * 2.2))
    return {
        "tokens_in": tokens_in, "tokens_out": tokens_out,
        "custo_usd": round(c, 4), "creditos": creditos_de(c),
        "creditos_min": creditos_de(c_min), "creditos_max": creditos_de(c_max),
    }


# ----------------------------------------------------------------- Anthropic
class AnthropicProvider:
    nome = "anthropic"

    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(
            api_key=api_key, max_retries=2, timeout=anthropic.Timeout(900.0, connect=10.0)
        )

    def executa(self, system: str, user: str, schema: dict, nivel_id: str, esforco: str | None) -> RespostaIA:
        n = nivel(nivel_id)
        kwargs = dict(
            model=n["modelo"],
            max_tokens=settings.max_tokens_saida,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={
                "effort": esforco or n["esforco_padrao"],
                "format": {"type": "json_schema", "schema": schema},
            },
        )
        try:
            if settings.enable_fallbacks and n.get("fallback"):
                # Reexecuta no servidor, em outro modelo, se um classificador de segurança recusar a requisição.
                stream_cm = self.client.beta.messages.stream(
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs
                )
            else:
                stream_cm = self.client.messages.stream(**kwargs)
            with stream_cm as stream:
                msg = stream.get_final_message()
        except anthropic.AuthenticationError as e:
            raise ErroIA("chave_invalida", "A chave de API foi recusada pelo provedor. Verifique a chave cadastrada.", str(e)) from e
        except anthropic.PermissionDeniedError as e:
            raise ErroIA("sem_permissao", "A chave de API não tem permissão para este modelo.", str(e)) from e
        except anthropic.RateLimitError as e:
            raise ErroIA("limite_provedor", "O provedor de IA limitou as requisições. Tente novamente em instantes.", str(e)) from e
        except anthropic.BadRequestError as e:
            texto = str(e).lower()
            if "credit balance" in texto:
                raise ErroIA("saldo_provedor", "A conta do provedor de IA está sem saldo.", str(e)) from e
            raise ErroIA("requisicao_invalida", "O provedor rejeitou a requisição.", str(e)) from e
        except anthropic.APIStatusError as e:
            raise ErroIA("erro_provedor", "O provedor de IA está indisponível no momento. Tente novamente.", str(e)) from e
        except anthropic.APIConnectionError as e:
            raise ErroIA("conexao", "Não foi possível conectar ao provedor de IA.", str(e)) from e

        if msg.stop_reason == "refusal":
            cat = getattr(getattr(msg, "stop_details", None), "category", None)
            raise ErroIA("recusado", "O modelo recusou a requisição por política de segurança. Revise os dados informados.", str(cat))
        if msg.stop_reason == "max_tokens":
            raise ErroIA("truncado", "A resposta excedeu o limite de tamanho e foi interrompida. Reduza o volume de dados ou tente novamente.")
        texto = next((b.text for b in msg.content if b.type == "text"), "")
        try:
            saida = json.loads(texto)
        except json.JSONDecodeError as e:
            raise ErroIA("saida_invalida", "O modelo não devolveu um documento no formato esperado.", texto[:500]) from e
        usou_fb = any(getattr(it, "type", "") == "fallback_message" for it in (getattr(msg.usage, "iterations", None) or []))
        return RespostaIA(
            saida=saida,
            tokens_in=msg.usage.input_tokens + (getattr(msg.usage, "cache_creation_input_tokens", 0) or 0)
            + (getattr(msg.usage, "cache_read_input_tokens", 0) or 0),
            tokens_out=msg.usage.output_tokens,
            modelo=msg.model,
            request_id=getattr(msg, "_request_id", None),
            usou_fallback=usou_fb,
        )


def testa_chave_anthropic(api_key: str) -> tuple[bool, str]:
    """Valida a chave com uma chamada gratuita de listagem de modelos."""
    try:
        client = anthropic.Anthropic(api_key=api_key, max_retries=1, timeout=anthropic.Timeout(15.0, connect=8.0))
        client.models.list(limit=1)
        return True, "Chave válida."
    except anthropic.AuthenticationError:
        return False, "Chave recusada pelo provedor."
    except anthropic.PermissionDeniedError:
        return False, "Chave sem permissão para listar modelos."
    except anthropic.APIConnectionError:
        return False, "Não foi possível conectar ao provedor para validar a chave."
    except anthropic.APIStatusError as e:
        return False, f"Provedor respondeu com erro {e.status_code}."


# ----------------------------------------------------------------- demonstração
class SimuladoProvider:
    nome = "simulado"

    def executa(self, prompt: dict, valores: dict, resultados: list, blocos: dict) -> RespostaIA:
        from .render import _valor_texto  # evita ciclo na importação

        dados = []
        for d in prompt["variaveis"]:
            v = valores.get(d["nome"])
            if v is None:
                continue
            txt = _valor_texto(d, v).replace("\n", " ")
            dados.append(f"{d['rotulo']}: {txt}")
        ausentes = [f"{d['rotulo']} (opcional, não informado)" for d in prompt["variaveis"] if valores.get(d["nome"]) is None]
        ausentes += [f"{r.rotulo}: {r.motivo}" for r in resultados if r.status != "calculado"]
        itens_formato = [
            re.sub(r"^\s*(?:[•\-]|\d+[.)])\s*", "", ln).strip()
            for ln in blocos.get("formato", "").splitlines() if ln.strip()
        ]
        secoes = [
            {"titulo": it.split(":")[0][:80] or "Seção",
             "conteudo": "**Espaço reservado (demonstração).** Aqui o modelo de IA entregaria: " + it}
            for it in itens_formato[:8]
        ] or [{"titulo": "Análise", "conteudo": "**Espaço reservado (demonstração).**"}]
        linhas_tab = [[r.rotulo, r.exibicao, r.id] for r in resultados if r.status == "calculado"]
        tabelas = [{"titulo": "Números verificados por código", "colunas": ["Indicador", "Valor", "Identificador"], "linhas": linhas_tab}] if linhas_tab else []
        saida = {
            "titulo": f"{prompt['titulo']} (modo demonstração)",
            "resumo_executivo": (
                "Modo demonstração: nenhum modelo de IA foi consultado e nada foi cobrado. Este documento mostra a "
                "estrutura da entrega com os seus dados e os números calculados por código. Para a análise real, execute "
                "com créditos ou com a sua própria chave."
            ),
            "dados_fornecidos": dados,
            "premissas": ["Os valores da tabela de números verificados foram calculados por código a partir dos dados informados."],
            "hipoteses_e_inferencias": ["Nenhuma hipótese foi gerada, pois não houve consulta ao modelo de IA."],
            "dados_ausentes": ausentes,
            "secoes": secoes,
            "tabelas": tabelas,
            "recomendacoes": ["Execute o prompt com um modelo de IA para obter a análise completa e, depois, valide-a com o responsável técnico."],
            "limitacoes_e_alertas": ["Saída simulada, sem valor analítico. Não use em decisão."],
            "valores_reportados": [{"id": r.id, "valor": r.valor} for r in resultados if r.status == "calculado" and r.valor is not None],
        }
        return RespostaIA(saida=saida, tokens_in=0, tokens_out=0, modelo="simulado")
