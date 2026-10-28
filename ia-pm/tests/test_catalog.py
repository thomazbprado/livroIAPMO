import json
import re
from pathlib import Path

import pytest

from app.catalog import catalogo, pode_ver_prompt, visao_publica
from app.config import CONTENT_DIR, TAXONOMIA
from app.engine import render, verify

C = catalogo()


def test_catalogo_carregado():
    assert len(C.prompts) == 11
    cob = C.cobertura()
    assert cob == {"celulas": 42, "cobertas": 11, "prompts": 11}
    m = C.matriz()
    assert m["og"]["fel2"] == 1 and m["og"]["execucao"] == 1 and m["quimico"]["fel1"] == 0


def test_tres_prompts_abertos():
    abertos = {p["id"] for p in C.prompts.values() if p.get("nivel_minimo", 1) == 0}
    assert abertos == {"mineracao.fel1.triagem-portfolio", "renovavel.execucao.evm-recuperacao", "og.execucao.flash-report-npt"}


@pytest.mark.parametrize("pid", sorted(C.prompts))
def test_casos_de_teste_do_livro(pid):
    p = C.prompts[pid]
    padrao = {v["nome"]: v.get("padrao") for v in p["variaveis"]}
    assert p["casos_de_teste"], "todo prompt precisa de ao menos um caso de teste"
    for caso in p["casos_de_teste"]:
        entrada = {**padrao, **caso["variaveis"]}
        valores = render.valida_variaveis(p["variaveis"], entrada)
        res = {r.id: r for r in verify.calcula_verificacoes(p, valores)}
        for vid, esperado in caso["esperado"].items():
            assert vid in res and res[vid].valor is not None, f"{pid}: verificação {vid} indisponível"
            assert res[vid].valor == pytest.approx(esperado, rel=0.006, abs=0.06), f"{pid}:{vid}"


@pytest.mark.parametrize("pid", sorted(C.prompts))
def test_prompt_renderiza_sem_variaveis_soltas(pid):
    p = C.prompts[pid]
    padrao = {v["nome"]: v.get("padrao") for v in p["variaveis"]}
    valores = render.valida_variaveis(p["variaveis"], padrao)
    res = verify.calcula_verificacoes(p, valores)
    system, user = render.monta_mensagens(p, valores, res)
    assert "{{" not in system + user
    assert "[TAREFA]" in user and "[FORMATO DE SAÍDA]" in user and "<contexto>" in user
    assert "Não invente valores" in system  # salvaguarda da plataforma sempre presente
    texto = render.prompt_para_copiar(p, valores, res)
    assert "[PAPEL]" in texto and "[SALVAGUARDAS]" in texto


def test_evm_do_livro_na_integra():
    p = C.prompts["renovavel.execucao.evm-recuperacao"]
    padrao = {v["nome"]: v.get("padrao") for v in p["variaveis"]}
    r = {x.id: x for x in verify.calcula_verificacoes(p, render.valida_variaveis(p["variaveis"], padrao))}
    assert round(r["cpi"].valor, 3) == 0.915 and round(r["spi"].valor, 3) == 0.870
    assert round(r["eac1"].valor, 1) == 743.1 and round(r["eac2"].valor, 1) == 813.5
    assert round(r["vac1"].valor, 1) == -63.1 and round(r["tcpi"].valor, 3) == 1.056
    assert r["eac3"].status == "indisponivel"  # sem ETC informado
    entrada = {**padrao, "etc": 480}
    r2 = {x.id: x for x in verify.calcula_verificacoes(p, render.valida_variaveis(p["variaveis"], entrada))}
    assert r2["eac3"].valor == 751.0


def test_acesso_por_plano():
    fechado = C.get("mineracao.fid.revisao-matriz-riscos")
    assert not pode_ver_prompt("explorar", fechado) and pode_ver_prompt("leitor", fechado)
    v = visao_publica(fechado, False)
    assert "rctif" not in v and v["acesso"] is False
    assert all(x["formula"] is None for x in v["verificacoes"])
    assert "rctif" in visao_publica(fechado, True)


def test_validacao_de_variaveis():
    p = C.prompts["renovavel.execucao.evm-recuperacao"]
    padrao = {v["nome"]: v.get("padrao") for v in p["variaveis"]}
    with pytest.raises(render.ErroVariaveis) as e:
        render.valida_variaveis(p["variaveis"], {**padrao, "ev": "abc", "ac": ""})
    assert "ev" in e.value.erros and "ac" in e.value.erros
    ok = render.valida_variaveis(p["variaveis"], {**padrao, "ev": "248,5"})
    assert ok["ev"] == 248.5


def test_schema_de_saida_restringe_ids():
    s = render.schema_saida(["cpi", "spi"])
    assert s["additionalProperties"] is False
    assert s["properties"]["valores_reportados"]["items"]["properties"]["id"]["enum"] == ["cpi", "spi"]
    json.dumps(s)


def test_sem_travessoes_no_conteudo_e_no_codigo():
    """O livro adota PT-BR sem travessões. O produto segue a mesma regra em todo texto visível."""
    base = Path(__file__).resolve().parent.parent
    ruins = []
    for pasta in ("content", "web", "app"):
        for arq in (base / pasta).rglob("*"):
            if arq.suffix in (".json", ".js", ".html", ".css", ".py", ".md", ".webmanifest") and arq.is_file():
                txt = arq.read_text(encoding="utf-8")
                for n, ln in enumerate(txt.splitlines(), 1):
                    if "—" in ln or "–" in ln:
                        ruins.append(f"{arq.relative_to(base)}:{n}")
    assert not ruins, ruins[:20]


def test_taxonomia_coerente():
    assert len(TAXONOMIA["setores"]) == 7 and len(TAXONOMIA["fases"]) == 6 and len(TAXONOMIA["disciplinas"]) == 7
