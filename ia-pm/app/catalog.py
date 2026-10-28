"""Catálogo de prompts: carga, validação e consulta.

Os prompts vivem em content/prompts/*.json (um arquivo por prompt, versionado no git).
Na inicialização o catálogo é validado por completo (esquema, taxonomia, variáveis de
template e expressões de verificação). Um prompt inválido impede o servidor de subir.
"""
from __future__ import annotations

import ast
import json
import re
from typing import Any

from .config import CONTENT_DIR, MODELOS, PLANOS, TAXONOMIA
from .engine import render, verify

TIPOS_VAR = {"texto", "texto_longo", "numero", "moeda", "percentual", "selecao", "data", "tabela"}
CAMPOS_OBRIGATORIOS = ["id", "versao", "titulo", "setor", "fase", "disciplinas", "resumo", "rctif", "variaveis", "verificacoes"]


class CatalogoInvalido(Exception):
    pass


def _ids(chave: str) -> set[str]:
    return {x["id"] for x in TAXONOMIA[chave]}


def _valida(p: dict, arquivo: str) -> None:
    def erro(msg: str):
        raise CatalogoInvalido(f"{arquivo}: {msg}")

    for c in CAMPOS_OBRIGATORIOS:
        if c not in p:
            erro(f"campo obrigatório ausente: {c}")
    if p["setor"] not in _ids("setores"):
        erro(f"setor inválido: {p['setor']}")
    if p["fase"] not in _ids("fases"):
        erro(f"fase inválida: {p['fase']}")
    for d in p["disciplinas"]:
        if d not in _ids("disciplinas"):
            erro(f"disciplina inválida: {d}")
    for k, _ in render.BLOCOS:
        if not p["rctif"].get(k):
            erro(f"bloco RCTIF ausente: {k}")
    nomes = [v["nome"] for v in p["variaveis"]]
    if len(nomes) != len(set(nomes)):
        erro("nomes de variáveis duplicados")
    for v in p["variaveis"]:
        if v["tipo"] not in TIPOS_VAR:
            erro(f"tipo de variável inválido: {v['tipo']}")
        if v["tipo"] == "tabela" and not v.get("colunas"):
            erro(f"variável tabela sem colunas: {v['nome']}")
        if v["tipo"] == "selecao" and not v.get("opcoes"):
            erro(f"variável seleção sem opções: {v['nome']}")
    usadas: set[str] = set()
    for k, _ in render.BLOCOS:
        usadas |= render.variaveis_usadas(p["rctif"][k])
    desconhecidas = usadas - set(nomes)
    if desconhecidas:
        erro(f"variáveis usadas no prompt e não declaradas: {sorted(desconhecidas)}")
    # Variáveis podem ser usadas só nas verificações (ex.: anos do ciclo).
    for v in p["verificacoes"]:
        expr = v.get("por_linha", {}).get("expr") if "por_linha" in v else v.get("expr")
        usadas |= set(re.findall(r"[A-Za-z_]\w*", expr or ""))
    nao_usadas = set(nomes) - usadas
    if nao_usadas:
        erro(f"variáveis declaradas e não usadas no prompt: {sorted(nao_usadas)}")
    ids_ver = set()
    for v in p["verificacoes"]:
        expr = v.get("por_linha", {}).get("expr") if "por_linha" in v else v.get("expr")
        if not expr:
            erro(f"verificação sem expressão: {v.get('id')}")
        try:
            ast.parse(expr, mode="eval")
        except SyntaxError as e:
            erro(f"expressão inválida em {v['id']}: {e}")
        if v["id"] in ids_ver:
            erro(f"id de verificação duplicado: {v['id']}")
        ids_ver.add(v["id"])
    if p.get("modelo_recomendado", "avancado") not in {n["id"] for n in MODELOS["niveis"]}:
        erro("modelo_recomendado inválido")
    # Smoke test: os valores padrão devem ser aceitos e as verificações, calculáveis.
    padrao = {v["nome"]: v.get("padrao") for v in p["variaveis"]}
    try:
        valores = render.valida_variaveis(p["variaveis"], padrao)
    except render.ErroVariaveis as e:
        erro(f"valores padrão inválidos: {e}")
    resultados = verify.calcula_verificacoes(p, valores)
    for r in resultados:
        if r.status == "indisponivel" and "expressão inválida" in r.motivo:
            erro(f"verificação {r.id}: {r.motivo}")
    render.monta_mensagens(p, valores, resultados)


class Catalogo:
    def __init__(self):
        self.prompts: dict[str, dict] = {}
        self.carrega()

    def carrega(self) -> None:
        novos: dict[str, dict] = {}
        for arq in sorted((CONTENT_DIR / "prompts").glob("*.json")):
            with arq.open(encoding="utf-8") as f:
                p = json.load(f)
            _valida(p, arq.name)
            if p["id"] in novos:
                raise CatalogoInvalido(f"{arq.name}: id duplicado {p['id']}")
            novos[p["id"]] = p
        self.prompts = novos

    # ---------------------------------------------------------- consulta
    def get(self, prompt_id: str) -> dict | None:
        return self.prompts.get(prompt_id)

    def lista(self, setor=None, fase=None, disciplina=None, q=None) -> list[dict]:
        out = []
        termo = (q or "").strip().lower()
        for p in self.prompts.values():
            if setor and p["setor"] != setor:
                continue
            if fase and p["fase"] != fase:
                continue
            if disciplina and disciplina not in p["disciplinas"]:
                continue
            if termo:
                alvo = " ".join([p["titulo"], p["resumo"], p.get("decisao_apoiada", ""), p["setor"], p["fase"]]).lower()
                if termo not in alvo:
                    continue
            out.append(p)
        ordem_fase = {f["id"]: f["ordem"] for f in TAXONOMIA["fases"]}
        out.sort(key=lambda p: (p["setor"], ordem_fase[p["fase"]], p["titulo"]))
        return out

    def matriz(self) -> dict[str, dict[str, int]]:
        """Contagem de prompts por setor x fase (cobertura do catálogo)."""
        m = {s["id"]: {f["id"]: 0 for f in TAXONOMIA["fases"]} for s in TAXONOMIA["setores"]}
        for p in self.prompts.values():
            m[p["setor"]][p["fase"]] += 1
        return m

    def cobertura(self) -> dict[str, int]:
        m = self.matriz()
        total = sum(len(v) for v in m.values())
        cobertas = sum(1 for v in m.values() for n in v.values() if n)
        return {"celulas": total, "cobertas": cobertas, "prompts": len(self.prompts)}


# ---------------------------------------------------------------- planos e acesso
def plano(plano_id: str) -> dict:
    for p in PLANOS["planos"]:
        if p["id"] == plano_id:
            return p
    return PLANOS["planos"][0]


def pode_ver_prompt(plano_id: str, p: dict) -> bool:
    return plano(plano_id)["nivel"] >= p.get("nivel_minimo", 1)


def visao_publica(p: dict, completo: bool) -> dict:
    """Representação do prompt para a API. Sem acesso, omite o texto RCTIF."""
    base = {k: v for k, v in p.items() if k not in ("rctif", "casos_de_teste", "verificacoes")}
    base["verificacoes"] = [
        {"id": v["id"], "rotulo": v["rotulo"], "unidade": v.get("unidade", ""),
         "formula": (v.get("por_linha", {}).get("expr") if "por_linha" in v else v.get("expr")) if completo else None,
         "por_linha": "por_linha" in v, "nota": v.get("nota", "")}
        for v in p["verificacoes"]
    ]
    base["acesso"] = completo
    if completo:
        base["rctif"] = p["rctif"]
    return base


_catalogo: Catalogo | None = None


def catalogo() -> Catalogo:
    global _catalogo
    if _catalogo is None:
        _catalogo = Catalogo()
    return _catalogo
