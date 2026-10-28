"""IA PM: portal SaaS de prompts de IA para gestão de projetos de capital."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from . import runner
from .catalog import catalogo
from .config import WEB_DIR, settings
from .db import init_db, session_scope
from .models import Org, RedeemCode, User, agora
from .routers import admin, auth, catalogo as catalogo_router, conta, execucoes, servicos
from .security import hash_senha, hash_token

log = logging.getLogger("iapm")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

CODIGO_DEMO = "IAPM-DEMO-LEITOR"


def bootstrap() -> None:
    init_db()
    catalogo()  # valida o catálogo inteiro; um prompt inválido impede a subida
    n = runner.marca_interrompidas()
    if n:
        log.warning("%d execução(ões) interrompida(s) por reinício foram encerradas como erro", n)
    with session_scope() as db:
        if settings.admin_email and settings.admin_password:
            email = settings.admin_email.strip().lower()
            if not db.scalar(select(User).where(User.email == email)):
                org = Org(nome="IA PM (equipe)", tipo="empresa", plano_id="corporativo", plano_origem="admin", politica={})
                db.add(org)
                db.flush()
                db.add(User(org_id=org.id, email=email, nome="Administração IA PM", senha_hash=hash_senha(settings.admin_password),
                            papel="admin", is_staff=True, onboarding_ok=True))
                log.info("Usuário administrador criado: %s", email)
        if not settings.is_prod and not db.scalar(select(RedeemCode).where(RedeemCode.code_hash == hash_token(CODIGO_DEMO))):
            db.add(RedeemCode(code_hash=hash_token(CODIGO_DEMO), dica="ITOR", plano_id="leitor", dias=180, lote="demo-dev"))
            log.info("Código de demonstração disponível (somente em desenvolvimento): %s", CODIGO_DEMO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    bootstrap()
    yield


app = FastAPI(
    title="IA PM API", version=runner.APP_VERSION, lifespan=lifespan,
    description="API do IA PM (IA Project Management): catálogo de prompts por setor, fase e disciplina, "
                "execução com verificação numérica e registro de auditoria.",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url=None, openapi_url="/openapi.json" if settings.docs_enabled else None,
)

for r in (auth.router, catalogo_router.router, execucoes.router, conta.router, servicos.router, admin.router):
    app.include_router(r)

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")


MAX_CORPO = 1_000_000  # 1 MB: o maior formulário legítimo tem poucas dezenas de KB


@app.middleware("http")
async def cabecalhos_seguranca(request: Request, call_next):
    if request.url.path.startswith("/v1/"):
        try:
            tamanho = int(request.headers.get("content-length") or 0)
        except ValueError:
            tamanho = 0
        if tamanho > MAX_CORPO:
            return JSONResponse({"detail": "Requisição grande demais."}, status_code=413)
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if not request.url.path.startswith(("/docs", "/openapi")):
        resp.headers.setdefault("Content-Security-Policy", CSP)
    if request.url.path.startswith("/v1/"):
        resp.headers["Cache-Control"] = "no-store"
    elif request.url.path.endswith((".html", ".js", ".css", ".webmanifest")) or request.url.path == "/":
        resp.headers["Cache-Control"] = "no-cache"
    if settings.is_prod:
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return resp


@app.get("/saude", tags=["operação"])
def saude():
    c = catalogo().cobertura()
    return {"status": "ok", "versao": runner.APP_VERSION, "prompts": c["prompts"],
            "ia_gerenciada": bool(settings.anthropic_api_key), "cobranca": settings.billing_mode}


@app.exception_handler(Exception)
async def erro_generico(request: Request, exc: Exception):
    log.exception("erro não tratado em %s", request.url.path)
    return JSONResponse({"detail": "Erro interno. Tente novamente."}, status_code=500)


app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
