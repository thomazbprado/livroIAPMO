"""Exportação da execução: Registro de Auditoria de IA (JSON), Markdown e HTML imprimível."""
from __future__ import annotations

import hashlib
import html
from typing import Any

from .models import Execution, User
from .runner import APP_VERSION

ROTULO_DECISAO = {"aprovada": "Aprovada", "aprovada_com_ressalvas": "Aprovada com ressalvas", "rejeitada": "Rejeitada"}
ROTULO_FONTE = {"creditos": "Créditos da plataforma", "byok": "Chave própria (BYOK)", "simulado": "Demonstração (sem IA)"}


def _validacoes(ex: Execution) -> list[dict]:
    return [
        {"data": v.criado_em.isoformat(), "decisao": v.decisao, "validador": v.validador_nome, "papel": v.validador_papel,
         "checklist": v.checklist, "justificativa": v.justificativa, "instancia_decisoria": v.instancia_decisoria,
         "condicionantes": v.condicionantes}
        for v in ex.validacoes
    ]


def registro_auditoria(ex: Execution, usuario: User | None, prompt: dict | None) -> dict:
    """Mapeia a execução para os elementos mínimos da Tabela 7.2 do livro."""
    saida = ex.saida or {}
    vals = _validacoes(ex)
    return {
        "registro_auditoria_ia": {
            "versao_do_formato": "1.0",
            "ferramenta_utilizada": {
                "plataforma": "IA PM", "versao_plataforma": APP_VERSION, "modelo": ex.modelo,
                "fonte_ia": ex.fonte_ia, "nivel_modelo": ex.nivel_modelo, "data_uso": ex.criado_em.isoformat(),
                "canal": ex.canal, "request_id_provedor": ex.request_id,
            },
            "finalidade": {"descricao": ex.finalidade, "projeto_ou_ativo": ex.projeto_ref},
            "dados_de_entrada": {
                "classificacao": ex.classificacao_dados, "variaveis": ex.variaveis,
                "origem": "informados pelo usuário no formulário do prompt",
            },
            "prompt_utilizado": {
                "id": ex.prompt_id, "versao": ex.prompt_versao, "titulo": ex.prompt_titulo,
                "origem": (prompt or {}).get("origem"),
                "responsavel": usuario.nome if usuario else None,
                "hash_sha256": hashlib.sha256(ex.prompt_renderizado.encode()).hexdigest(),
                "texto_renderizado": ex.prompt_renderizado,
            },
            "saida_gerada": saida,
            "premissas_e_limitacoes": {
                "premissas": saida.get("premissas", []), "hipoteses_e_inferencias": saida.get("hipoteses_e_inferencias", []),
                "dados_ausentes": saida.get("dados_ausentes", []), "limitacoes_e_alertas": saida.get("limitacoes_e_alertas", []),
            },
            "verificacao_numerica": {"calculos_por_codigo": ex.verificacoes, "conferencia_com_a_saida": ex.conferencia},
            "validacao_humana": vals,
            "decisao_final": (vals[-1] if vals else None),
            "consumo": {"tokens_entrada": ex.tokens_in, "tokens_saida": ex.tokens_out, "custo_usd": ex.custo_usd,
                        "creditos_cobrados": ex.creditos_cobrados},
        }
    }


def _lista_md(titulo: str, itens: list[str]) -> str:
    if not itens:
        return ""
    return f"### {titulo}\n" + "\n".join(f"- {i}" for i in itens) + "\n\n"


def para_markdown(ex: Execution) -> str:
    s = ex.saida or {}
    out = [f"# {s.get('titulo') or ex.prompt_titulo}\n",
           f"*Gerado no IA PM em {ex.criado_em:%d/%m/%Y %H:%M} UTC. Modelo: {ex.modelo}. Classificação dos dados: {ex.classificacao_dados}. "
           f"Rascunho analítico sujeito à validação humana.*\n",
           f"## Resumo executivo\n{s.get('resumo_executivo', '')}\n"]
    for sec in s.get("secoes", []):
        out.append(f"## {sec['titulo']}\n{sec['conteudo']}\n")
    for t in s.get("tabelas", []):
        out.append(f"### {t['titulo']}\n")
        cols = t["colunas"]
        out.append("| " + " | ".join(cols) + " |\n|" + "---|" * len(cols))
        for ln in t["linhas"]:
            out.append("| " + " | ".join(str(c).replace("|", "/") for c in ln) + " |")
        out.append("")
    out.append(_lista_md("Recomendações", s.get("recomendacoes", [])))
    out.append(_lista_md("Dados fornecidos", s.get("dados_fornecidos", [])))
    out.append(_lista_md("Premissas", s.get("premissas", [])))
    out.append(_lista_md("Hipóteses e inferências", s.get("hipoteses_e_inferencias", [])))
    out.append(_lista_md("Dados ausentes", s.get("dados_ausentes", [])))
    out.append(_lista_md("Limitações e alertas", s.get("limitacoes_e_alertas", [])))
    if ex.conferencia:
        out.append("### Verificação numérica (código x modelo)\n| Indicador | Calculado | Reportado | Situação |\n|---|---|---|---|")
        for c in ex.conferencia:
            rep = "não reportado" if c["reportado"] is None else f"{c['reportado']:g}"
            out.append(f"| {c['rotulo']} | {c['esperado_exibicao']} | {rep} | {c['status']} |")
        out.append("")
    for v in ex.validacoes:
        out.append(f"### Validação humana\n- Decisão: {ROTULO_DECISAO.get(v.decisao, v.decisao)}\n- Validador: {v.validador_nome} ({v.validador_papel})\n"
                   f"- Justificativa: {v.justificativa or 'não informada'}\n- Instância decisória: {v.instancia_decisoria or 'não informada'}\n"
                   f"- Condicionantes: {v.condicionantes or 'nenhuma'}\n")
    return "\n".join(x for x in out if x is not None)


def _e(x: Any) -> str:
    return html.escape(str(x))


def _md_inline(txt: str) -> str:
    """Markdown mínimo e seguro: escapa tudo e só então aplica negrito, itálico e listas."""
    import re

    linhas, em_lista, out = _e(txt).split("\n"), False, []
    for ln in linhas:
        ln = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", ln)
        ln = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<em>\1</em>", ln)
        if re.match(r"^\s*[-•]\s+", ln):
            if not em_lista:
                out.append("<ul>")
                em_lista = True
            out.append("<li>" + re.sub(r"^\s*[-•]\s+", "", ln) + "</li>")
        else:
            if em_lista:
                out.append("</ul>")
                em_lista = False
            out.append(f"<p>{ln}</p>" if ln.strip() else "")
    if em_lista:
        out.append("</ul>")
    return "\n".join(out)


def para_html(ex: Execution, usuario: User | None) -> str:
    s = ex.saida or {}
    corpo = [f"<h1>{_e(s.get('titulo') or ex.prompt_titulo)}</h1>",
             f"<p class='meta'>Gerado no IA PM em {ex.criado_em:%d/%m/%Y %H:%M} UTC por {_e(usuario.nome if usuario else '')}. "
             f"Modelo: {_e(ex.modelo)}. Fonte: {_e(ROTULO_FONTE.get(ex.fonte_ia, ex.fonte_ia))}. Classificação dos dados: {_e(ex.classificacao_dados)}.</p>",
             "<div class='aviso'>Rascunho analítico gerado por IA, sujeito à validação humana. Não substitui o julgamento técnico, jurídico ou regulatório.</div>",
             "<h2>Resumo executivo</h2>" + _md_inline(s.get("resumo_executivo", ""))]
    for sec in s.get("secoes", []):
        corpo.append(f"<h2>{_e(sec['titulo'])}</h2>" + _md_inline(sec["conteudo"]))
    for t in s.get("tabelas", []):
        th = "".join(f"<th>{_e(c)}</th>" for c in t["colunas"])
        tr = "".join("<tr>" + "".join(f"<td>{_e(c)}</td>" for c in ln) + "</tr>" for ln in t["linhas"])
        corpo.append(f"<h3>{_e(t['titulo'])}</h3><table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>")

    def lista(titulo, itens):
        if itens:
            corpo.append(f"<h3>{titulo}</h3><ul>" + "".join(f"<li>{_e(i)}</li>" for i in itens) + "</ul>")

    lista("Recomendações", s.get("recomendacoes", []))
    lista("Dados fornecidos", s.get("dados_fornecidos", []))
    lista("Premissas", s.get("premissas", []))
    lista("Hipóteses e inferências", s.get("hipoteses_e_inferencias", []))
    lista("Dados ausentes", s.get("dados_ausentes", []))
    lista("Limitações e alertas", s.get("limitacoes_e_alertas", []))
    if ex.conferencia:
        linhas = "".join(
            f"<tr><td>{_e(c['rotulo'])}</td><td>{_e(c['esperado_exibicao'])}</td>"
            f"<td>{'não reportado' if c['reportado'] is None else _e(f'{c['reportado']:g}')}</td><td>{_e(c['status'])}</td></tr>"
            for c in ex.conferencia
        )
        corpo.append("<h3>Verificação numérica (código x modelo)</h3><table><thead><tr><th>Indicador</th><th>Calculado por código</th>"
                     f"<th>Reportado pelo modelo</th><th>Situação</th></tr></thead><tbody>{linhas}</tbody></table>")
    for v in ex.validacoes:
        corpo.append(
            "<h3>Validação humana</h3><ul>"
            f"<li>Decisão: <strong>{_e(ROTULO_DECISAO.get(v.decisao, v.decisao))}</strong></li>"
            f"<li>Validador: {_e(v.validador_nome)} ({_e(v.validador_papel)})</li>"
            f"<li>Justificativa: {_e(v.justificativa or 'não informada')}</li>"
            f"<li>Instância decisória: {_e(v.instancia_decisoria or 'não informada')}</li>"
            f"<li>Condicionantes: {_e(v.condicionantes or 'nenhuma')}</li></ul>"
        )
    if not ex.validacoes:
        corpo.append("<div class='aviso'>Este documento ainda não tem validação humana registrada.</div>")
    return (
        "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>"
        + _e(s.get("titulo") or ex.prompt_titulo)
        + "</title><style>body{font:15px/1.55 'Segoe UI',system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 20px;color:#1b2430}"
        "h1{font-size:24px}h2{font-size:18px;margin-top:28px;border-bottom:1px solid #d6dde6;padding-bottom:4px}h3{font-size:15px;margin-top:20px}"
        "table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}th,td{border:1px solid #cfd8e3;padding:6px 8px;text-align:left;vertical-align:top}"
        "th{background:#eef3f8}.meta{color:#5b6b7d;font-size:13px}.aviso{background:#fff6e0;border:1px solid #f0d58a;padding:10px 12px;border-radius:6px;margin:14px 0;font-size:13px}"
        "@media print{body{margin:0}}</style></head><body>" + "\n".join(corpo) + "</body></html>"
    )
