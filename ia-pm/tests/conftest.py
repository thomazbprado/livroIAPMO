import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="iapm-test-")
os.environ["IAPM_DATABASE_URL"] = os.environ.get("IAPM_TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ["IAPM_SECRET_KEY"] = "chave-de-teste-" + "x" * 40
os.environ["IAPM_ENV"] = "dev"
os.environ["IAPM_BILLING_MODE"] = "demo"
os.environ["IAPM_ADMIN_EMAIL"] = "staff@iapm.test"
os.environ["IAPM_ADMIN_PASSWORD"] = "SenhaStaff123"
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-gerenciada-de-teste-0000000000"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import runner  # noqa: E402
from app.engine import llm  # noqa: E402
from app.engine.llm import RespostaIA  # noqa: E402
from app.ratelimit import limitador  # noqa: E402

H = {"X-IAPM-Client": "web"}
SENHA = "SenhaForte123"


class ModeloFalso:
    """Substitui a chamada ao provedor: devolve um documento válido usando os números do sistema."""

    chamadas: list = []
    divergir: str | None = None
    falhar: llm.ErroIA | None = None

    def __init__(self, chave: str):
        self.chave = chave

    def executa(self, system, user, schema, nivel_id, esforco):
        ModeloFalso.chamadas.append({"system": system, "user": user, "schema": schema, "nivel": nivel_id, "chave": self.chave})
        if ModeloFalso.falhar:
            raise ModeloFalso.falhar
        ids = schema["properties"]["valores_reportados"]["items"]["properties"]["id"].get("enum", [])
        # extrai "- id | rótulo: 1.234,5 unidade" do bloco do sistema
        import re
        valores = []
        for m in re.finditer(r"^- (\w+) \| [^:]+: (?:US\$ |R\$ )?([\-\d\.,]+)", user, re.M):
            vid, txt = m.group(1), m.group(2)
            if vid in ids:
                v = float(txt.replace(".", "").replace(",", "."))
                if ModeloFalso.divergir == vid:
                    v *= 1.5
                valores.append({"id": vid, "valor": v})
        saida = {
            "titulo": "Documento de teste", "resumo_executivo": "Resumo **de teste**.",
            "dados_fornecidos": ["dado 1"], "premissas": ["premissa 1"], "hipoteses_e_inferencias": ["hipótese 1"],
            "dados_ausentes": [], "secoes": [{"titulo": "Seção 1", "conteudo": "- item um\n- item dois"}],
            "tabelas": [{"titulo": "Tabela 1", "colunas": ["A", "B"], "linhas": [["1", "2"]]}],
            "recomendacoes": ["recomendação 1"], "limitacoes_e_alertas": ["alerta 1"], "valores_reportados": valores,
        }
        return RespostaIA(saida=saida, tokens_in=3000, tokens_out=6000, modelo="claude-opus-5-5", request_id="req_teste")


@pytest.fixture(autouse=True)
def _estado(monkeypatch):
    limitador.reinicia()
    ModeloFalso.chamadas = []
    ModeloFalso.divergir = None
    ModeloFalso.falhar = None
    monkeypatch.setattr(llm, "AnthropicProvider", ModeloFalso)
    yield


@pytest.fixture(scope="session")
def app_client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def cliente(app_client):
    """Cliente novo (cookies limpos) para cada teste."""
    from app.main import app

    c = TestClient(app)
    c.__enter__()
    yield c
    c.__exit__(None, None, None)


_contador = {"n": 0}


def novo_usuario(c: TestClient, nome="Ana Teste", org="", convite="", email=None):
    _contador["n"] += 1
    email = email or f"user{_contador['n']}@iapm.test"
    r = c.post("/v1/auth/registrar", json={"email": email, "senha": SENHA, "nome": nome, "organizacao": org, "convite": convite})
    assert r.status_code == 200, r.text
    return email, r.json()


def executa(c, prompt_id, **extra):
    corpo = {"classificacao_dados": "interna", "aguardar": True}
    corpo.update(extra)
    return c.post(f"/v1/prompts/{prompt_id}/executar", json=corpo, headers=H)


def novo_codigo(dias: int = 180) -> str:
    """Cria um código do livro de uso único direto no banco (os códigos são guardados só como hash)."""
    from app.db import session_scope
    from app.models import RedeemCode
    from app.routers.admin import gera_codigo
    from app.security import hash_token

    codigo = gera_codigo()
    with session_scope() as db:
        db.add(RedeemCode(code_hash=hash_token(codigo), dica=codigo[-4:], plano_id="leitor", dias=dias, lote="teste"))
    return codigo


def liberar_leitor(c, codigo: str | None = None):
    return c.post("/v1/assinatura/resgatar", json={"codigo": codigo or novo_codigo()}, headers=H)
