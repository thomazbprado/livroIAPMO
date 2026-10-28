"""Testa o AnthropicProvider real com um cliente de SDK simulado (sem rede)."""
import json
from types import SimpleNamespace

import anthropic
import httpx2 as httpx
import pytest

from app.engine import llm
from app.engine.llm import AnthropicProvider as Real, ErroIA  # importado antes do monkeypatch da fixture

SCHEMA = {"type": "object", "properties": {"x": {"type": "string"}}, "required": ["x"], "additionalProperties": False}


class _Stream:
    def __init__(self, msg, erro=None):
        self.msg, self.erro = msg, erro

    def __enter__(self):
        if self.erro:
            raise self.erro
        return self

    def __exit__(self, *a):
        return False

    def get_final_message(self):
        return self.msg


def _msg(texto='{"x": "ok"}', stop="end_turn", modelo="claude-opus-5-5", tin=1000, tout=2000, iteracoes=None):
    return SimpleNamespace(
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=texto)],
        stop_reason=stop, stop_details=SimpleNamespace(category="cyber"), model=modelo, _request_id="req_1",
        usage=SimpleNamespace(input_tokens=tin, output_tokens=tout, cache_creation_input_tokens=0, cache_read_input_tokens=0, iterations=iteracoes),
    )


def _provider(msg=None, erro=None):
    p = Real.__new__(Real)
    capt = {}

    def _stream(**kw):
        capt["kw"] = kw
        return _Stream(msg, erro)

    def _beta_stream(**kw):
        capt["beta"] = True
        return _stream(**kw)

    p.client = SimpleNamespace(
        messages=SimpleNamespace(stream=lambda **kw: (capt.update(beta=False), _stream(**kw))[1]),
        beta=SimpleNamespace(messages=SimpleNamespace(stream=_beta_stream)),
    )
    return p, capt


def test_chamada_avancada_usa_fallback_e_saida_estruturada():
    p, capt = _provider(_msg())
    r = p.executa("sistema", "usuario", SCHEMA, "avancado", "high")
    kw = capt["kw"]
    assert capt["beta"] is True
    assert kw["model"] == "claude-opus-5-5" and kw["fallbacks"] == "default"
    assert kw["betas"] == ["server-side-fallback-2026-07-01"]
    assert kw["output_config"] == {"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}}
    assert kw["system"] == "sistema" and kw["messages"] == [{"role": "user", "content": "usuario"}]
    for proibido in ("temperature", "top_p", "top_k", "thinking", "budget_tokens"):
        assert proibido not in kw
    assert r.saida == {"x": "ok"} and r.tokens_in == 1000 and r.tokens_out == 2000 and r.request_id == "req_1"


def test_haiku_nao_usa_fallback_do_servidor():
    p, capt = _provider(_msg(modelo="claude-haiku-5-5"))
    p.executa("s", "u", SCHEMA, "rapido", None)
    assert capt["beta"] is False and "fallbacks" not in capt["kw"]
    assert capt["kw"]["model"] == "claude-haiku-5-5" and capt["kw"]["output_config"]["effort"] == "medium"


def test_recusa_truncamento_e_json_invalido():
    for msg, codigo in ((_msg(stop="refusal", texto=""), "recusado"), (_msg(stop="max_tokens"), "truncado"), (_msg(texto="não é json"), "saida_invalida")):
        p, _ = _provider(msg)
        with pytest.raises(ErroIA) as e:
            p.executa("s", "u", SCHEMA, "avancado", None)
        assert e.value.codigo == codigo


def _resp(status):
    return httpx.Response(status, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))


@pytest.mark.parametrize("exc,codigo", [
    (anthropic.AuthenticationError("x", response=_resp(401), body=None), "chave_invalida"),
    (anthropic.PermissionDeniedError("x", response=_resp(403), body=None), "sem_permissao"),
    (anthropic.RateLimitError("x", response=_resp(429), body=None), "limite_provedor"),
    (anthropic.BadRequestError("Your credit balance is too low", response=_resp(400), body=None), "saldo_provedor"),
    (anthropic.BadRequestError("outro", response=_resp(400), body=None), "requisicao_invalida"),
    (anthropic.InternalServerError("x", response=_resp(500), body=None), "erro_provedor"),
    (anthropic.APIConnectionError(request=httpx.Request("POST", "https://x")), "conexao"),
])
def test_erros_do_sdk_viram_mensagens_seguras(exc, codigo):
    p, _ = _provider(erro=exc)
    with pytest.raises(ErroIA) as e:
        p.executa("s", "u", SCHEMA, "avancado", None)
    assert e.value.codigo == codigo
    assert "sk-ant" not in e.value.mensagem


def test_custo_e_creditos():
    assert llm.custo_usd("avancado", 1_000_000, 1_000_000) == pytest.approx(24.0)
    assert llm.custo_usd("equilibrado", 1_000_000, 1_000_000) == pytest.approx(12.0)
    assert llm.custo_usd("rapido", 1_000_000, 1_000_000) == pytest.approx(0.6)
    assert llm.creditos_de(0) == 0 and llm.creditos_de(0.0001) == 1
    # margem-alvo: o preço cobrado em R$ cobre o custo com folga (custo / (1 - 70%))
    custo = llm.custo_usd("avancado", 3000, 6000)
    cobrado_brl = llm.creditos_de(custo) * 0.12
    assert cobrado_brl >= custo * 5.5 / 0.30 - 0.12
    with pytest.raises(ValueError):
        llm.nivel("inexistente")
