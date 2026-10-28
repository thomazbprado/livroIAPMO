from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import billing
from .db import get_db
from .models import ApiKey, AuditEvent, Org, User, agora
from .security import hash_token, le_sessao

COOKIE = "iapm_sessao"
CABECALHO_CLIENTE = "x-iapm-client"
METODOS_MUTAVEIS = {"POST", "PUT", "PATCH", "DELETE"}


@dataclass
class Ctx:
    user: User
    org: Org
    canal: str  # web | api
    api_key: ApiKey | None = None


def ip_cliente(request: Request) -> str:
    """IP do cliente. Atrás de proxy, o uvicorn (--proxy-headers, com --forwarded-allow-ips restrito ao proxy)
    já corrige `request.client`. O cabeçalho X-Forwarded-For não é lido aqui, para não ser falsificável."""
    return (request.client.host if request.client else "")[:64]


def registra(db: Session, request: Request | None, acao: str, ctx: Ctx | None = None, org_id: str | None = None,
             user_id: str | None = None, **detalhe) -> None:
    db.add(AuditEvent(
        org_id=(ctx.org.id if ctx else org_id), user_id=(ctx.user.id if ctx else user_id),
        acao=acao, detalhe=detalhe, ip=ip_cliente(request) if request else "",
    ))


def contexto(request: Request, db: Session = Depends(get_db)) -> Ctx:
    auth = request.headers.get("authorization", "")
    chave = request.headers.get("x-api-key") or (auth[7:].strip() if auth.lower().startswith("bearer ") else "")
    if chave:
        k = db.scalar(select(ApiKey).where(ApiKey.key_hash == hash_token(chave)))
        if k is None or k.revogado_em is not None:
            raise HTTPException(401, "Chave de API inválida ou revogada.")
        user = db.get(User, k.user_id)
        org = db.get(Org, k.org_id)
        if user is None or not user.ativo or org is None:
            raise HTTPException(401, "Chave de API inválida ou revogada.")
        k.ultimo_uso = agora()
        ctx = Ctx(user, org, "api", k)
    else:
        token = request.cookies.get(COOKIE)
        uid = le_sessao(token) if token else None
        user = db.get(User, uid) if uid else None
        if user is None or not user.ativo:
            raise HTTPException(401, "Sessão expirada. Entre novamente.")
        if request.method in METODOS_MUTAVEIS and CABECALHO_CLIENTE not in request.headers:
            raise HTTPException(403, "Requisição não autorizada (cabeçalho de cliente ausente).")
        ctx = Ctx(user, db.get(Org, user.org_id), "web")
    billing.garante_credito_mensal(db, ctx.org)
    db.commit()
    return ctx


def exige_admin_org(ctx: Ctx = Depends(contexto)) -> Ctx:
    if ctx.user.papel != "admin":
        raise HTTPException(403, "Apenas administradores da organização podem fazer isto.")
    return ctx


def exige_staff(ctx: Ctx = Depends(contexto)) -> Ctx:
    if not ctx.user.is_staff:
        raise HTTPException(403, "Acesso restrito à equipe da plataforma.")
    return ctx
