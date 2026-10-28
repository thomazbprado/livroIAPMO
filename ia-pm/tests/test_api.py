import json
import re
import sqlite3

import pytest

from app.config import settings
from app.engine import llm
from tests.conftest import H, SENHA, ModeloFalso, executa, liberar_leitor, novo_codigo, novo_usuario

EVM = "renovavel.execucao.evm-recuperacao"
FECHADO = "mineracao.fid.revisao-matriz-riscos"


# ---------------------------------------------------------------- autenticação
def test_registro_login_e_sessao(cliente):
    email, eu = novo_usuario(cliente, "Beatriz Souza")
    assert eu["usuario"]["nome"] == "Beatriz Souza" and eu["plano"]["id"] == "explorar" and eu["creditos"] == 0
    assert cliente.get("/v1/auth/eu").status_code == 200
    cliente.post("/v1/auth/sair", headers=H)
    cliente.cookies.clear()
    assert cliente.get("/v1/auth/eu").status_code == 401
    r = cliente.post("/v1/auth/entrar", json={"email": email, "senha": SENHA})
    assert r.status_code == 200 and cliente.get("/v1/auth/eu").status_code == 200


def test_sondagem_de_sessao_nao_gera_401(cliente):
    r = cliente.get("/v1/auth/sessao")
    assert r.status_code == 200 and r.json() == {"autenticado": False}
    novo_usuario(cliente)
    r = cliente.get("/v1/auth/sessao").json()
    assert r["autenticado"] is True and r["usuario"]["nome"] == "Ana Teste"


def test_login_errado_e_senha_fraca(cliente):
    email, _ = novo_usuario(cliente)
    cliente.cookies.clear()
    assert cliente.post("/v1/auth/entrar", json={"email": email, "senha": "errada"}).status_code == 401
    assert cliente.post("/v1/auth/entrar", json={"email": "naoexiste@x.com", "senha": "qualquer"}).status_code == 401
    r = cliente.post("/v1/auth/registrar", json={"email": "fraca@x.com", "senha": "curta", "nome": "Fulano"})
    assert r.status_code == 422
    r = cliente.post("/v1/auth/registrar", json={"email": email, "senha": SENHA, "nome": "Duplicado"})
    assert r.status_code == 409


def test_bloqueio_por_tentativas(cliente):
    email, _ = novo_usuario(cliente)
    cliente.cookies.clear()
    for _ in range(8):
        cliente.post("/v1/auth/entrar", json={"email": email, "senha": "errada"})
    assert cliente.post("/v1/auth/entrar", json={"email": email, "senha": SENHA}).status_code == 429


def test_csrf_exige_cabecalho_em_metodos_mutaveis(cliente):
    novo_usuario(cliente)
    r = cliente.post(f"/v1/prompts/{EVM}/executar", json={"classificacao_dados": "interna"})
    assert r.status_code == 403
    assert cliente.get("/v1/prompts").status_code == 200


# ---------------------------------------------------------------- catálogo e acesso
def test_catalogo_publico_nao_expoe_prompts(cliente):
    r = cliente.get("/v1/catalogo")
    assert r.status_code == 200
    d = r.json()
    assert d["cobertura"]["prompts"] == 11 and len(d["prompts"]) == 11
    assert "rctif" not in json.dumps(d)
    assert "preco_in_usd_mtok" not in json.dumps(d)


def test_explorar_ve_amostras_e_bloqueia_o_resto(cliente):
    novo_usuario(cliente)
    aberto = cliente.get(f"/v1/prompts/{EVM}").json()
    assert aberto["acesso"] and "rctif" in aberto and aberto["rctif"]["papel"]
    fechado = cliente.get(f"/v1/prompts/{FECHADO}").json()
    assert fechado["acesso"] is False and "rctif" not in fechado
    r = cliente.post(f"/v1/prompts/{FECHADO}/previa", json={"variaveis": {}}, headers=H)
    assert r.status_code == 403
    r = executa(cliente, FECHADO, fonte_ia="simulado")
    assert r.status_code == 403


def test_resgate_do_codigo_libera_leitor_e_creditos(cliente):
    novo_usuario(cliente)
    r = liberar_leitor(cliente)
    assert r.status_code == 200, r.text
    conta = r.json()["conta"]
    assert conta["plano"]["id"] == "leitor" and conta["plano"]["origem"] == "livro" and conta["creditos"] == 300
    assert cliente.get(f"/v1/prompts/{FECHADO}").json()["acesso"] is True
    # o código é de uso único
    cod = novo_codigo()
    assert liberar_leitor(cliente, cod).status_code == 200
    novo_usuario(cliente)
    assert liberar_leitor(cliente, cod).status_code == 409
    assert cliente.post("/v1/assinatura/resgatar", json={"codigo": "IAPM-XXXX-XXXX-XXXX"}, headers=H).status_code == 404


def test_previa_calcula_verificacoes_e_estimativa(cliente):
    novo_usuario(cliente)
    r = cliente.post(f"/v1/prompts/{EVM}/previa", json={"variaveis": {}, "nivel_modelo": "avancado"}, headers=H)
    d0 = r.json()
    assert r.status_code == 200 and d0["valido"] is False and "bac" in d0["campos"] and d0["prompt_pronto"] is None  # formulário incompleto
    assert cliente.post(f"/v1/prompts/{EVM}/renderizar", json={"variaveis": {}}, headers=H).status_code == 422
    vars_ = {"ativo": "Parque", "potencia_mw": 150, "aerogeradores": 50, "semana_atual": 32, "semanas_total": 78,
             "bac": 680, "pv": 285, "ev": 248, "ac": 271, "causas": "Atraso"}
    r = cliente.post(f"/v1/prompts/{EVM}/previa", json={"variaveis": vars_}, headers=H)
    assert r.status_code == 200
    d = r.json()
    assert d["valido"] is True and d["campos"] == {}
    cpi = next(v for v in d["verificacoes"] if v["id"] == "cpi")
    assert cpi["status"] == "calculado" and cpi["exibicao"] == "0,915"
    assert "[PAPEL]" in d["prompt_pronto"] and d["estimativa"]["creditos"] > 0
    # prévia parcial: com só o que já foi digitado, as verificações possíveis aparecem
    parc = cliente.post(f"/v1/prompts/{EVM}/previa", json={"variaveis": {"bac": 680, "pv": 285, "ev": 248, "ac": "abc"}}, headers=H).json()
    ids = {v["id"]: v for v in parc["verificacoes"]}
    assert parc["valido"] is False and "ac" in parc["campos"]
    assert ids["sv"]["status"] == "calculado" and ids["cpi"]["status"] == "indisponivel"


# ---------------------------------------------------------------- execução
def test_execucao_simulada_completa_e_auditoria(cliente):
    novo_usuario(cliente)
    r = executa(cliente, EVM, variaveis={"ativo": "Parque", "potencia_mw": 150, "aerogeradores": 50, "semana_atual": 32,
                                        "semanas_total": 78, "bac": 680, "pv": 285, "ev": 248, "ac": 271, "causas": "Atraso"},
                fonte_ia="simulado")
    assert r.status_code == 202, r.text
    ex = r.json()
    assert ex["status"] == "concluida" and ex["fonte_ia"] == "simulado" and ex["creditos_cobrados"] == 0
    assert "demonstração" in ex["saida"]["titulo"]
    assert ex["modelo"] == "simulado" and not ModeloFalso.chamadas  # nenhuma chamada externa
    assert all(c["status"] == "confere" for c in ex["conferencia"])
    det = cliente.get(f"/v1/execucoes/{ex['id']}").json()
    assert det["prompt_renderizado"].startswith("[SISTEMA]")
    assert cliente.get(f"/v1/execucoes/{ex['id']}/exportar?formato=html").status_code == 200
    md = cliente.get(f"/v1/execucoes/{ex['id']}/exportar?formato=md")
    assert md.status_code == 200 and "Resumo executivo" in md.text
    # auditoria JSON só a partir do Leitor
    assert cliente.get(f"/v1/execucoes/{ex['id']}/auditoria").status_code == 403
    liberar_leitor(cliente)
    aud = cliente.get(f"/v1/execucoes/{ex['id']}/auditoria").json()["registro_auditoria_ia"]
    for chave in ("ferramenta_utilizada", "finalidade", "dados_de_entrada", "prompt_utilizado", "saida_gerada",
                  "premissas_e_limitacoes", "validacao_humana", "decisao_final"):
        assert chave in aud  # elementos mínimos da Tabela 7.2 do livro
    assert len(aud["prompt_utilizado"]["hash_sha256"]) == 64


def test_classificacao_obrigatoria_e_dados_restritos(cliente):
    novo_usuario(cliente)
    base = {"variaveis": {}, "fonte_ia": "simulado"}
    r = cliente.post(f"/v1/prompts/{EVM}/executar", json={**base}, headers=H)
    assert r.status_code == 422 and r.json()["detail"]["codigo"] == "classificacao_obrigatoria"
    r = cliente.post(f"/v1/prompts/{EVM}/executar", json={**base, "classificacao_dados": "restrita", "fonte_ia": "creditos"}, headers=H)
    assert r.status_code == 422 and r.json()["detail"]["codigo"] == "dados_restritos"


def test_creditos_sao_debitados_e_saldo_insuficiente_bloqueia(cliente):
    novo_usuario(cliente)
    liberar_leitor(cliente)  # 300 créditos
    vars_ = {"capex_projeto": "US$ 1,2 bilhão", "prazo_meses": 60, "total_riscos": 45, "riscos": [
        {"id": "R01", "descricao": "Licenciamento", "p": 4, "i": 5, "plano": "Monitoramento"}]}
    r = executa(cliente, FECHADO, variaveis=vars_, fonte_ia="creditos", nivel_modelo="avancado")
    assert r.status_code == 202, r.text
    ex = r.json()
    assert ex["status"] == "concluida" and ex["creditos_cobrados"] > 0 and ex["custo_usd"] > 0
    assert ModeloFalso.chamadas[-1]["chave"] == settings.anthropic_api_key
    assert ex["conferencia"] and all(c["status"] == "confere" for c in ex["conferencia"])
    extrato = cliente.get("/v1/creditos").json()
    assert extrato["saldo"] == 300 - ex["creditos_cobrados"]
    assert extrato["lancamentos"][0]["motivo"] == "consumo" and extrato["lancamentos"][0]["delta"] < 0
    # esvazia o saldo e tenta de novo
    from app.db import session_scope
    from app import billing
    from app.models import Org
    me = cliente.get("/v1/auth/eu").json()
    with session_scope() as db:
        billing.lanca(db, me["organizacao"]["id"], -billing.saldo(db, me["organizacao"]["id"]) + 1, "ajuste", None, "teste")
    r = executa(cliente, FECHADO, variaveis=vars_, fonte_ia="creditos")
    assert r.status_code == 402 and r.json()["detail"]["codigo"] == "saldo_insuficiente"


def test_divergencia_numerica_exige_justificativa_na_aprovacao(cliente):
    novo_usuario(cliente)
    ModeloFalso.divergir = "cpi"
    vars_ = {"ativo": "Parque", "potencia_mw": 150, "aerogeradores": 50, "semana_atual": 32, "semanas_total": 78,
             "bac": 680, "pv": 285, "ev": 248, "ac": 271, "causas": "Atraso"}
    liberar_leitor(cliente)
    cliente.post("/v1/conta/byok", headers=H)
    r = cliente.put("/v1/conta/byok", json={"chave": "sk-ant-api03-chave-do-usuario-1234567890"}, headers=H)
    assert r.status_code == 200 and r.json()["final"] == "7890"
    ex = executa(cliente, EVM, variaveis=vars_, fonte_ia="byok").json()
    assert ex["status"] == "concluida" and ex["divergencias"] == 1 and ex["creditos_cobrados"] == 0
    assert ModeloFalso.chamadas[-1]["chave"] == "sk-ant-api03-chave-do-usuario-1234567890"
    cpi = next(c for c in ex["conferencia"] if c["id"] == "cpi")
    assert cpi["status"] == "diverge"
    ok = {"item": "x", "ok": True}
    base = {"decisao": "aprovada", "validador_nome": "Carlos", "validador_papel": "Controlador", "checklist": [ok]}
    r = cliente.post(f"/v1/execucoes/{ex['id']}/validacao", json=base, headers=H)
    assert r.status_code == 422 and r.json()["detail"]["codigo"] == "divergencia_numerica"
    r = cliente.post(f"/v1/execucoes/{ex['id']}/validacao",
                     json={**base, "decisao": "aprovada_com_ressalvas", "justificativa": "CPI recalculado em planilha."}, headers=H)
    assert r.status_code == 201 and r.json()["validacao"] == "aprovada_com_ressalvas"


def test_validacao_humana_regras(cliente):
    novo_usuario(cliente)
    vars_ = {"ativo": "Parque", "potencia_mw": 150, "aerogeradores": 50, "semana_atual": 32, "semanas_total": 78,
             "bac": 680, "pv": 285, "ev": 248, "ac": 271, "causas": "Atraso"}
    ex = executa(cliente, EVM, variaveis=vars_, fonte_ia="simulado").json()
    url = f"/v1/execucoes/{ex['id']}/validacao"
    assert cliente.post(url, json={"decisao": "talvez"}, headers=H).status_code == 422
    assert cliente.post(url, json={"decisao": "aprovada"}, headers=H).status_code == 422  # sem validador
    sem_check = {"decisao": "aprovada", "validador_nome": "Ana", "validador_papel": "Gerente", "checklist": []}
    assert cliente.post(url, json=sem_check, headers=H).json()["detail"]["codigo"] == "checklist_incompleto"
    parcial = {**sem_check, "checklist": [{"item": "a", "ok": True}, {"item": "b", "ok": False}]}
    assert cliente.post(url, json=parcial, headers=H).status_code == 422
    rej = {"decisao": "rejeitada", "validador_nome": "Ana", "validador_papel": "Gerente"}
    assert cliente.post(url, json=rej, headers=H).status_code == 422  # rejeição exige justificativa
    final = {**sem_check, "checklist": [{"item": "a", "ok": True}], "instancia_decisoria": "Comitê de Investimento",
             "condicionantes": "Revalidar no próximo corte."}
    r = cliente.post(url, json=final, headers=H)
    assert r.status_code == 201 and r.json()["validacao"] == "aprovada"
    assert r.json()["validacoes"][0]["instancia_decisoria"] == "Comitê de Investimento"


def test_erro_do_provedor_nao_cobra_credito(cliente):
    novo_usuario(cliente)
    liberar_leitor(cliente)
    ModeloFalso.falhar = llm.ErroIA("limite_provedor", "O provedor de IA limitou as requisições. Tente novamente em instantes.")
    vars_ = {"capex_projeto": "US$ 1", "prazo_meses": 60, "total_riscos": 45, "riscos": [
        {"id": "R01", "descricao": "Licenciamento", "p": 4, "i": 5, "plano": "Monitoramento"}]}
    r = executa(cliente, FECHADO, variaveis=vars_, fonte_ia="creditos")
    ex = r.json()
    assert ex["status"] == "erro" and "limitou" in ex["erro"]
    assert cliente.get("/v1/creditos").json()["saldo"] == 300


def test_byok_nao_e_armazenada_em_texto_claro(cliente):
    novo_usuario(cliente)
    chave = "sk-ant-api03-SEGREDO-que-nao-pode-vazar-0001"
    assert cliente.put("/v1/conta/byok", json={"chave": chave}, headers=H).status_code == 200
    if settings.database_url.startswith("sqlite"):
        bruto = open(settings.database_url.replace("sqlite:///", ""), "rb").read()
        assert b"SEGREDO-que-nao-pode-vazar" not in bruto
    else:
        from sqlalchemy import text
        from app.db import engine
        with engine.connect() as c:
            assert chave not in str(c.execute(text("select byok_key_enc from orgs where byok_key_enc is not null")).fetchall())
    assert chave not in json.dumps(cliente.get("/v1/auth/eu").json())
    assert cliente.put("/v1/conta/byok", json={"chave": "chave-sem-prefixo-valido-123456"}, headers=H).status_code == 422
    assert cliente.delete("/v1/conta/byok", headers=H).json()["configurado"] is False


# ---------------------------------------------------------------- API por chave e isolamento
def test_api_key_e_isolamento_entre_organizacoes(cliente, app_client):
    novo_usuario(cliente)
    assert cliente.post("/v1/chaves", json={"nome": "Excel"}, headers=H).status_code == 403  # Explorar não tem API
    liberar_leitor(cliente)
    r = cliente.post("/v1/chaves", json={"nome": "Excel"}, headers=H)
    assert r.status_code == 201
    chave = r.json()["chave"]
    assert chave.startswith("ipm_") and "chave" not in cliente.get("/v1/chaves").json()["chaves"][0]
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as api:  # sem cookie: autentica só pela chave
        h = {"Authorization": f"Bearer {chave}"}
        assert api.get("/v1/prompts", headers=h).status_code == 200
        r = api.post(f"/v1/prompts/{EVM}/executar", headers=h, json={
            "classificacao_dados": "interna", "fonte_ia": "simulado", "aguardar": True,
            "variaveis": {"ativo": "P", "potencia_mw": 1, "aerogeradores": 1, "semana_atual": 1, "semanas_total": 2,
                          "bac": 10, "pv": 5, "ev": 4, "ac": 5, "causas": "x"}})
        assert r.status_code == 202 and r.json()["canal"] == "api"
        exec_id = r.json()["id"]
        assert api.get("/v1/execucoes/" + exec_id, headers=h).status_code == 200
        assert api.get("/v1/prompts", headers={"Authorization": "Bearer ipm_invalida"}).status_code == 401
        # outra organização não enxerga a execução
        with TestClient(app) as outro:
            novo_usuario(outro)
            assert outro.get("/v1/execucoes/" + exec_id).status_code == 404
            assert exec_id not in json.dumps(outro.get("/v1/execucoes").json())
        # revogação
        kid = cliente.get("/v1/chaves").json()["chaves"][0]["id"]
        assert cliente.delete(f"/v1/chaves/{kid}", headers=H).status_code == 200
        assert api.get("/v1/prompts", headers=h).status_code == 401


def test_limite_de_taxa_por_organizacao(cliente):
    novo_usuario(cliente)  # Explorar: 5 execuções por minuto
    vars_ = {"ativo": "P", "potencia_mw": 1, "aerogeradores": 1, "semana_atual": 1, "semanas_total": 2,
             "bac": 10, "pv": 5, "ev": 4, "ac": 5, "causas": "x"}
    codigos = [executa(cliente, EVM, variaveis=vars_, fonte_ia="simulado").status_code for _ in range(7)]
    assert codigos[:5] == [202] * 5 and codigos[5:] == [429, 429]


# ---------------------------------------------------------------- equipe, planos, admin
def test_checkout_demo_convites_e_assentos(cliente):
    email, _ = novo_usuario(cliente, org="Construtora Teste")
    r = cliente.post("/v1/org/convites", json={"email": "colega@iapm.test"}, headers=H)
    assert r.status_code == 409  # Explorar: 1 assento
    assert cliente.post("/v1/assinatura/checkout", json={"plano_id": "corporativo"}, headers=H).status_code == 400
    r = cliente.post("/v1/assinatura/checkout", json={"plano_id": "equipe", "meses": 1}, headers=H)
    assert r.status_code == 200 and r.json()["conta"]["plano"]["id"] == "equipe" and r.json()["conta"]["creditos"] == 8000
    r = cliente.post("/v1/org/convites", json={"email": "colega@iapm.test"}, headers=H)
    assert r.status_code == 201
    token = r.json()["convite"]
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as colega:
        r = colega.post("/v1/auth/registrar", json={"email": "outro@iapm.test", "senha": SENHA, "nome": "Xavier", "convite": token})
        assert r.status_code == 403  # convite de outro e-mail
        r = colega.post("/v1/auth/registrar", json={"email": "colega@iapm.test", "senha": SENHA, "nome": "Colega", "convite": token})
        assert r.status_code == 200 and r.json()["usuario"]["papel"] == "membro" and r.json()["plano"]["id"] == "equipe"
        assert colega.put("/v1/conta/byok", json={"chave": "sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx"}, headers=H).status_code == 403
        assert colega.post("/v1/auth/registrar", json={"email": "z@iapm.test", "senha": SENHA, "nome": "Zilda", "convite": token}).status_code == 410
    membros = cliente.get("/v1/org/membros").json()
    assert membros["assentos"] == {"usados": 2, "total": 10}


def test_admin_gera_codigos_e_resgate(cliente):
    novo_usuario(cliente)
    assert cliente.post("/v1/admin/codigos", json={"quantidade": 2}, headers=H).status_code == 403
    cliente.cookies.clear()
    assert cliente.post("/v1/auth/entrar", json={"email": "staff@iapm.test", "senha": "SenhaStaff123"}).status_code == 200
    r = cliente.post("/v1/admin/codigos", json={"quantidade": 3, "dias": 90, "lote": "livro-1a-ed"}, headers=H)
    assert r.status_code == 201
    codigos = r.json()["codigos"]
    assert len(set(codigos)) == 3 and all(re.fullmatch(r"IAPM-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}", c) for c in codigos)
    assert cliente.get("/v1/admin/resumo", headers=H).json()["codigos_total"] >= 4
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as leitor:
        novo_usuario(leitor)
        r = leitor.post("/v1/assinatura/resgatar", json={"codigo": codigos[0].lower()}, headers=H)
        assert r.status_code == 200 and r.json()["dias"] == 90


def test_servicos_e_leads(cliente):
    s = cliente.get("/v1/servicos").json()["servicos"]
    assert len(s) >= 6
    r = cliente.post("/v1/servicos/solicitar", json={"nome": "Marta", "email": "marta@empresa.com", "servico_id": s[0]["id"], "mensagem": "Quero uma proposta."})
    assert r.status_code == 201
    assert cliente.post("/v1/servicos/solicitar", json={"nome": "Marta", "email": "invalido", "servico_id": s[0]["id"]}).status_code == 422
    assert cliente.post("/v1/servicos/solicitar", json={"nome": "Marta", "email": "m@e.com", "servico_id": "inexistente"}).status_code == 422


def test_uso_agrega_execucoes(cliente):
    novo_usuario(cliente)
    vars_ = {"ativo": "P", "potencia_mw": 1, "aerogeradores": 1, "semana_atual": 1, "semanas_total": 2,
             "bac": 10, "pv": 5, "ev": 4, "ac": 5, "causas": "x"}
    executa(cliente, EVM, variaveis=vars_, fonte_ia="simulado")
    executa(cliente, EVM, variaveis=vars_, fonte_ia="simulado")
    u = cliente.get("/v1/uso").json()
    assert u["total"]["execucoes"] == 2 and u["por_prompt"][0]["execucoes"] == 2


def test_headers_de_seguranca_e_saude(cliente):
    r = cliente.get("/saude")
    assert r.json()["prompts"] == 11
    assert "default-src 'self'" in r.headers["content-security-policy"]
    assert r.headers["x-frame-options"] == "DENY" and r.headers["x-content-type-options"] == "nosniff"


def test_corpo_grande_demais_e_rejeitado(cliente):
    novo_usuario(cliente)
    r = cliente.post("/v1/sugestoes", content=b"x" * 1_100_000, headers={**H, "content-type": "application/json"})
    assert r.status_code == 413


def test_retencao_remove_execucoes_antigas(cliente):
    from datetime import timedelta
    from app import cli
    from app.db import session_scope
    from app.models import Execution, agora

    novo_usuario(cliente)
    vars_ = {"ativo": "P", "potencia_mw": 1, "aerogeradores": 1, "semana_atual": 1, "semanas_total": 2,
             "bac": 10, "pv": 5, "ev": 4, "ac": 5, "causas": "x"}
    antiga = executa(cliente, EVM, variaveis=vars_, fonte_ia="simulado").json()["id"]
    recente = executa(cliente, EVM, variaveis=vars_, fonte_ia="simulado").json()["id"]
    with session_scope() as db:
        db.get(Execution, antiga).criado_em = agora() - timedelta(days=400)
    cli.purge(365)
    assert cliente.get(f"/v1/execucoes/{antiga}").status_code == 404
    assert cliente.get(f"/v1/execucoes/{recente}").status_code == 200
