import pytest

from app.engine import verify
from app.engine.verify import Tabela, avalia_expressao, confere, fmt_num, irr, npv, parse_numero


@pytest.mark.parametrize("txt,esp", [
    ("680", 680.0), ("1.234,56", 1234.56), ("1234.56", 1234.56), ("R$ 680", 680.0), ("15,7%", 15.7),
    ("1.200", 1200.0), ("0,915", 0.915), ("-23", -23.0), ("1,28", 1.28), (7, 7.0), ("  ", None), (None, None),
])
def test_parse_numero(txt, esp):
    assert parse_numero(txt) == esp


def test_parse_numero_invalido():
    with pytest.raises(ValueError):
        parse_numero("abc")
    with pytest.raises(ValueError):
        parse_numero(True)


def test_fmt_num():
    assert fmt_num(1234.5, 2) == "1.234,50"
    assert fmt_num(5250000, 0) == "5.250.000"
    assert fmt_num(None) == "indisponível"


def test_exibicao_com_unidade():
    assert verify.exibe(5250000, 0, "R$") == "R$ 5.250.000"
    assert verify.exibe(743.06, 1, "R$ milhões") == "R$ 743,1 milhões"
    assert verify.exibe(494.1, 1, "R$ milhões/km") == "R$ 494,1 milhões/km"
    assert verify.exibe(1750000, 0, "R$/dia") == "R$ 1.750.000/dia"
    assert verify.exibe(0.18, 3, "US$ bilhões") == "US$ 0,180 bilhões"
    assert verify.exibe(15.7, 1, "%") == "15,7 %"
    assert verify.exibe(0.915, 3, "") == "0,915"


def test_expressoes_basicas():
    env = {"a": 10.0, "b": 4.0}
    assert avalia_expressao("a / b + 1", env) == 3.5
    assert avalia_expressao("max(a, b) - min(a, b)", env) == 6.0
    assert avalia_expressao("a if a > b else b", env) == 10.0


@pytest.mark.parametrize("expr", [
    "__import__('os').system('echo x')", "a.__class__", "open('x')", "(lambda: 1)()", "a[0]", "'texto'",
    "[x for x in range(3)]", "a ** 99", "exec('1')",
])
def test_expressoes_inseguras_sao_rejeitadas(expr):
    with pytest.raises((ValueError, SyntaxError, verify.Indisponivel, KeyError)):
        avalia_expressao(expr, {"a": 2.0})


def test_nao_informado_vira_indisponivel():
    with pytest.raises(verify.Indisponivel):
        avalia_expressao("a + b", {"a": 1.0, "b": None})


def test_divisao_por_zero():
    with pytest.raises(ZeroDivisionError):
        avalia_expressao("a / b", {"a": 1.0, "b": 0.0})


def test_financeiro():
    fluxos = [-100.0, 30.0, 40.0, 50.0, 20.0]
    assert npv(0.1, fluxos) == pytest.approx(sum(f / 1.1 ** t for t, f in enumerate(fluxos)))
    taxa = irr(fluxos)
    assert npv(taxa, fluxos) == pytest.approx(0, abs=1e-6)
    with pytest.raises(ValueError):
        irr([10, 20])


def test_tabela_colunas():
    t = Tabela([{"nome": "x", "tipo": "numero"}, {"nome": "n", "tipo": "texto"}], [{"x": "2", "n": "a"}, {"x": 3, "n": "b"}])
    assert t.x == [2.0, 3.0]
    assert t.n == ["a", "b"]
    with pytest.raises(verify.Indisponivel):
        t.inexistente


def test_confere_status():
    r1 = verify.Resultado("cpi", "CPI", 0.915, "0,915", "", "calculado", "", 0.005)
    r2 = verify.Resultado("eac1", "EAC1", 743.06, "743,1", "", "calculado", "", 0.005)
    r3 = verify.Resultado("vac1", "VAC1", -63.06, "-63,1", "", "calculado", "", 0.005)
    r4 = verify.Resultado("eac3", "EAC3", None, "indisponível", "", "indisponivel", "etc", 0.005)
    out = {c["id"]: c for c in confere([r1, r2, r3, r4], [{"id": "cpi", "valor": 0.915}, {"id": "eac1", "valor": 800.0}])}
    assert out["cpi"]["status"] == "confere"
    assert out["eac1"]["status"] == "diverge"
    assert out["vac1"]["status"] == "nao_reportado"
    assert "eac3" not in out
