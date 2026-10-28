"""Verificação numérica por código.

Cada prompt do catálogo declara verificações como expressões (ex.: "ev / ac").
O sistema as calcula de forma determinística ANTES de chamar o modelo, injeta os
resultados no prompt como referência e, depois, confere o que o modelo reportou.
A avaliação usa um interpretador restrito (ast), sem `eval` genérico.
"""
from __future__ import annotations

import ast
import math
import unicodedata
import operator
import re
from dataclasses import dataclass
from typing import Any

# ----------------------------------------------------------------- números pt-BR
_NUM_RE = re.compile(r"[-+]?\d[\d.,]*")


def parse_numero(valor: Any) -> float | None:
    """Converte '1.234,56', '1234.56', 'R$ 680', '15,7%' em float. Retorna None se vazio."""
    if valor is None:
        return None
    if isinstance(valor, bool):
        raise ValueError("valor numérico inválido")
    if isinstance(valor, (int, float)):
        if math.isnan(valor) or math.isinf(valor):
            raise ValueError("valor numérico inválido")
        return float(valor)
    s = str(valor).strip()
    if not s:
        return None
    neg = s.startswith("-") or s.startswith("(") and s.endswith(")")
    m = _NUM_RE.search(s.replace("−", "-"))
    if not m:
        raise ValueError(f"'{valor}' não é um número")
    t = m.group(0).lstrip("+-")
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".")
    elif "," in t:
        t = t.replace(",", ".")
    elif "." in t and re.fullmatch(r"\d{1,3}(\.\d{3})+", t):
        t = t.replace(".", "")
    try:
        n = float(t)
    except ValueError as e:
        raise ValueError(f"'{valor}' não é um número") from e
    return -n if neg else n


def fmt_num(v: float | None, casas: int = 2) -> str:
    """Formata no padrão brasileiro (milhar com ponto, decimal com vírgula)."""
    if v is None:
        return "indisponível"
    s = f"{v:,.{casas}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def exibe(valor: float, casas: int, unidade: str) -> str:
    """Valor com unidade no padrão brasileiro: moeda antes do número (R$ 743,1 milhões), demais unidades depois."""
    n = fmt_num(valor, casas)
    for moeda in ("US$", "R$"):
        if unidade.startswith(moeda):
            resto = unidade[len(moeda):]
            if not resto:
                return f"{moeda} {n}"
            return f"{moeda} {n}{resto}" if resto.startswith("/") else f"{moeda} {n} {resto.strip()}"
    return f"{n} {unidade}".strip()


def fmt_livre(v: float) -> str:
    """Formata sem casas desnecessárias (usado para exibir entradas do usuário)."""
    if abs(v - round(v)) < 1e-9:
        return fmt_num(v, 0)
    s = fmt_num(v, 4).rstrip("0").rstrip(",")
    return s


# ----------------------------------------------------------------- funções financeiras
def npv(taxa: float, fluxos: list[float]) -> float:
    """VPL com o primeiro fluxo no período 0."""
    return sum(f / (1 + taxa) ** t for t, f in enumerate(fluxos))


def irr(fluxos: list[float]) -> float:
    """TIR por bissecção. Exige ao menos uma troca de sinal."""
    if not (any(f < 0 for f in fluxos) and any(f > 0 for f in fluxos)):
        raise ValueError("TIR exige fluxos com sinais opostos")
    lo, hi = -0.99, 10.0
    flo, fhi = npv(lo, fluxos), npv(hi, fluxos)
    if flo * fhi > 0:
        raise ValueError("TIR não encontrada no intervalo")
    for _ in range(200):
        mid = (lo + hi) / 2
        fm = npv(mid, fluxos)
        if abs(fm) < 1e-9:
            return mid
        if flo * fm < 0:
            hi, fhi = mid, fm
        else:
            lo, flo = mid, fm
    return (lo + hi) / 2


def ponderada(valores: list[float], pesos: list[float]) -> float:
    tot = sum(pesos)
    if tot == 0:
        raise ZeroDivisionError("soma de pesos igual a zero")
    return sum(v * p for v, p in zip(valores, pesos)) / tot


def media(valores: list[float]) -> float:
    return sum(valores) / len(valores)


_FUNCS = {
    "abs": abs, "min": min, "max": max, "round": round, "sum": sum, "len": len,
    "soma": sum, "media": media, "ponderada": ponderada, "npv": npv, "vpl": npv, "irr": irr, "tir": irr,
    "sqrt": math.sqrt,
}

_BIN = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Mod: operator.mod, ast.Pow: operator.pow,
}
_CMP = {
    ast.Gt: operator.gt, ast.GtE: operator.ge, ast.Lt: operator.lt, ast.LtE: operator.le,
    ast.Eq: operator.eq, ast.NotEq: operator.ne,
}


class Indisponivel(Exception):
    """Dado de entrada ausente ou inválido para a verificação."""


class Tabela:
    """Visão de uma variável do tipo tabela: `projetos.capex` devolve a lista de valores."""

    def __init__(self, colunas: list[dict], linhas: list[dict]):
        self._cols = {c["nome"]: c for c in colunas}
        self._linhas = linhas

    def __getattr__(self, nome: str):
        if nome.startswith("_"):
            raise AttributeError(nome)
        col = self._cols.get(nome)
        if col is None:
            raise Indisponivel(f"coluna '{nome}' inexistente")
        out = []
        for ln in self._linhas:
            v = ln.get(nome)
            if col.get("tipo") in ("numero", "moeda", "percentual"):
                n = parse_numero(v)
                if n is None:
                    raise Indisponivel(f"coluna '{nome}' com valor vazio")
                out.append(n)
            else:
                out.append(v)
        return out

    def __len__(self):
        return len(self._linhas)


def _avalia(no: ast.AST, env: dict[str, Any], profundidade: int = 0) -> Any:
    if profundidade > 40:
        raise ValueError("expressão muito profunda")
    ev = lambda n: _avalia(n, env, profundidade + 1)  # noqa: E731
    if isinstance(no, ast.Expression):
        return ev(no.body)
    if isinstance(no, ast.Constant):
        if isinstance(no.value, (int, float)) and not isinstance(no.value, bool):
            return no.value
        raise ValueError("constante não permitida")
    if isinstance(no, ast.Name):
        if no.id not in env:
            raise ValueError(f"nome desconhecido: {no.id}")
        v = env[no.id]
        if v is None:
            raise Indisponivel(f"'{no.id}' não informado")
        return v
    if isinstance(no, ast.BinOp) and type(no.op) in _BIN:
        a, b = ev(no.left), ev(no.right)
        if isinstance(no.op, ast.Pow) and (not isinstance(b, (int, float)) or abs(b) > 12):
            raise ValueError("expoente não permitido")
        return _BIN[type(no.op)](a, b)
    if isinstance(no, ast.UnaryOp) and isinstance(no.op, (ast.USub, ast.UAdd)):
        v = ev(no.operand)
        return -v if isinstance(no.op, ast.USub) else v
    if isinstance(no, ast.Compare) and len(no.ops) == 1 and type(no.ops[0]) in _CMP:
        return _CMP[type(no.ops[0])](ev(no.left), ev(no.comparators[0]))
    if isinstance(no, ast.BoolOp):
        vals = [ev(v) for v in no.values]
        return all(vals) if isinstance(no.op, ast.And) else any(vals)
    if isinstance(no, ast.IfExp):
        return ev(no.body) if ev(no.test) else ev(no.orelse)
    if isinstance(no, (ast.List, ast.Tuple)):
        return [ev(e) for e in no.elts]
    if isinstance(no, ast.Attribute) and isinstance(no.value, ast.Name):
        base = ev(no.value)
        if not isinstance(base, Tabela):
            raise ValueError("atributo só é permitido em tabelas")
        return getattr(base, no.attr)
    if isinstance(no, ast.Call) and isinstance(no.func, ast.Name) and no.func.id in _FUNCS and not no.keywords:
        return _FUNCS[no.func.id](*[ev(a) for a in no.args])
    raise ValueError(f"construção não permitida: {type(no).__name__}")


def avalia_expressao(expr: str, env: dict[str, Any]) -> float:
    if len(expr) > 400:
        raise ValueError("expressão longa demais")
    arvore = ast.parse(expr, mode="eval")
    r = _avalia(arvore, env)
    if isinstance(r, bool) or not isinstance(r, (int, float)):
        raise ValueError("a expressão não resultou em número")
    if math.isnan(r) or math.isinf(r):
        raise ZeroDivisionError("resultado indefinido")
    return float(r)


# ----------------------------------------------------------------- verificações do prompt
@dataclass
class Resultado:
    id: str
    rotulo: str
    valor: float | None
    exibicao: str
    unidade: str
    status: str  # calculado | indisponivel
    motivo: str = ""
    tolerancia_rel: float = 0.005
    nota: str = ""

    def como_dict(self) -> dict:
        return self.__dict__.copy()


def _executa(v: dict, env: dict[str, Any], id_: str, rotulo: str) -> Resultado:
    casas = int(v.get("casas", 2))
    unidade = v.get("unidade", "")
    tol = float(v.get("tolerancia_rel", 0.005))
    nota = v.get("nota", "")
    try:
        val = avalia_expressao(v["expr"], env)
        exib = exibe(val, casas, unidade)
        return Resultado(id_, rotulo, val, exib, unidade, "calculado", "", tol, nota)
    except Indisponivel as e:
        return Resultado(id_, rotulo, None, "indisponível", unidade, "indisponivel", str(e), tol, nota)
    except ZeroDivisionError:
        return Resultado(id_, rotulo, None, "indisponível", unidade, "indisponivel", "divisão por zero", tol, nota)
    except (ValueError, SyntaxError) as e:
        return Resultado(id_, rotulo, None, "indisponível", unidade, "indisponivel", f"expressão inválida: {e}", tol, nota)


def monta_ambiente(variaveis_def: list[dict], valores: dict[str, Any]) -> dict[str, Any]:
    """Valores já validados -> ambiente para as expressões (números como float, tabelas como Tabela)."""
    env: dict[str, Any] = {}
    for d in variaveis_def:
        nome, tipo = d["nome"], d["tipo"]
        v = valores.get(nome)
        if tipo in ("numero", "moeda", "percentual"):
            env[nome] = parse_numero(v) if v not in (None, "") else None
        elif tipo == "tabela":
            linhas = v or []
            env[nome] = Tabela(d["colunas"], linhas) if linhas else None
        else:
            env[nome] = v
    return env


def calcula_verificacoes(prompt: dict, valores: dict[str, Any]) -> list[Resultado]:
    defs = prompt.get("variaveis", [])
    env = monta_ambiente(defs, valores)
    out: list[Resultado] = []
    for v in prompt.get("verificacoes", []):
        if "por_linha" in v:
            pl = v["por_linha"]
            tab = next((d for d in defs if d["nome"] == pl["tabela"]), None)
            linhas = valores.get(pl["tabela"]) or []
            for i, ln in enumerate(linhas):
                renv = dict(env)
                for c in tab["colunas"]:
                    if c.get("tipo") in ("numero", "moeda", "percentual"):
                        try:
                            renv[c["nome"]] = parse_numero(ln.get(c["nome"]))
                        except ValueError:
                            renv[c["nome"]] = None
                    else:
                        renv[c["nome"]] = ln.get(c["nome"])
                chave = str(ln.get(pl["chave"], i + 1)).strip() or str(i + 1)
                sem_acento = unicodedata.normalize("NFKD", chave).encode("ascii", "ignore").decode()
                slug = re.sub(r"[^A-Za-z0-9_]+", "_", sem_acento).strip("_") or str(i + 1)
                out.append(_executa({**v, "expr": pl["expr"]}, renv, f"{v['id']}_{slug}", f"{v['rotulo']} ({chave})"))
        else:
            out.append(_executa(v, env, v["id"], v["rotulo"]))
    return out


def ids_verificacao(prompt: dict, resultados: list[Resultado]) -> list[str]:
    return [r.id for r in resultados if r.status == "calculado"]


# ----------------------------------------------------------------- conferência
def confere(resultados: list[Resultado], reportados: list[dict]) -> list[dict]:
    """Compara o que o modelo reportou com o que o código calculou."""
    rep = {}
    for r in reportados or []:
        try:
            rep[r["id"]] = float(r["valor"])
        except (KeyError, TypeError, ValueError):
            continue
    out = []
    for r in resultados:
        if r.status != "calculado" or r.valor is None:
            continue
        if r.id not in rep:
            status, desvio = "nao_reportado", None
        else:
            ref = r.valor
            dif = abs(rep[r.id] - ref)
            limite = max(abs(ref) * r.tolerancia_rel, 10 ** -(4 if abs(ref) < 10 else 2))
            status = "confere" if dif <= limite else "diverge"
            desvio = rep[r.id] - ref
        out.append({
            "id": r.id, "rotulo": r.rotulo, "esperado": r.valor, "esperado_exibicao": r.exibicao,
            "reportado": rep.get(r.id), "status": status, "desvio": desvio, "unidade": r.unidade,
        })
    return out
