from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import billing
from ..catalog import plano
from ..config import PLANOS, settings
from ..db import get_db
from ..deps import COOKIE, Ctx, contexto, ip_cliente, registra
from ..models import Invite, Org, User, agora
from ..ratelimit import limitador
from ..schemas import LoginIn, RegistroIn, SenhaIn
from ..security import cria_sessao, confere_senha, hash_senha, hash_token, le_sessao, senha_valida

router = APIRouter(prefix="/v1/auth", tags=["autenticação"])
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_HASH_FALSO = hash_senha("senha-falsa-para-igualar-o-tempo")


def _define_cookie(resp: Response, user: User) -> None:
    resp.set_cookie(
        COOKIE, cria_sessao(user.id), max_age=3600 * settings.sessao_horas, httponly=True,
        samesite="lax", secure=bool(settings.cookie_secure), path="/",
    )


def eu_payload(db: Session, ctx: Ctx) -> dict:
    org, user = ctx.org, ctx.user
    p = billing.plano_efetivo(db, org)
    validade = org.plano_valido_ate
    if validade and validade.tzinfo is None:
        validade = validade.replace(tzinfo=timezone.utc)
    return {
        "usuario": {"id": user.id, "nome": user.nome, "email": user.email, "papel": user.papel, "is_staff": user.is_staff,
                    "onboarding_ok": user.onboarding_ok},
        "organizacao": {"id": org.id, "nome": org.nome, "tipo": org.tipo, "politica": org.politica or {}},
        "plano": {"id": p["id"], "nome": p["nome"], "nivel": p["nivel"], "origem": org.plano_origem,
                  "valido_ate": validade.isoformat() if validade else None, "api": p["api"], "byok": p["byok"],
                  "assentos": p["assentos"], "exportar_auditoria": p["exportar_auditoria"]},
        "creditos": billing.saldo(db, org.id),
        "byok": {"configurado": bool(org.byok_key_enc), "final": org.byok_last4},
        "ambiente": {
            "creditos_gerenciados": bool(settings.anthropic_api_key),
            "cobranca": settings.billing_mode,
            "producao": settings.is_prod,
        },
    }


@router.post("/registrar")
def registrar(body: RegistroIn, request: Request, resp: Response, db: Session = Depends(get_db)):
    ip = ip_cliente(request)
    if not limitador.permite(f"reg:{ip}", 10, 3600):
        raise HTTPException(429, "Muitas tentativas de cadastro. Tente novamente mais tarde.")
    email = body.email.strip().lower()
    if not _EMAIL.match(email):
        raise HTTPException(422, "Informe um e-mail válido.")
    erro_senha = senha_valida(body.senha)
    if erro_senha:
        raise HTTPException(422, erro_senha)
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Já existe uma conta com este e-mail.")
    convite = None
    if body.convite.strip():
        convite = db.scalar(select(Invite).where(Invite.token_hash == hash_token(body.convite.strip())))
        exp = convite.expira_em.replace(tzinfo=timezone.utc) if convite and convite.expira_em.tzinfo is None else (convite.expira_em if convite else None)
        if convite is None or convite.usado_em is not None or exp < agora():
            raise HTTPException(410, "Convite inválido, expirado ou já utilizado.")
        if convite.email.lower() != email:
            raise HTTPException(403, "Este convite foi emitido para outro e-mail.")
        org = db.get(Org, convite.org_id)
        usados = db.scalar(select(func.count(User.id)).where(User.org_id == org.id)) or 0
        if usados >= plano(billing.plano_efetivo(db, org)["id"])["assentos"]:
            raise HTTPException(409, "A organização atingiu o limite de usuários do plano.")
        papel = convite.papel if convite.papel in ("admin", "membro") else "membro"
        convite.usado_em = agora()
    elif not settings.allow_signup:
        raise HTTPException(403, "O cadastro aberto está desabilitado. Peça um convite.")
    else:
        nome_org = body.organizacao.strip() or f"Espaço de {body.nome.strip()}"
        org = Org(nome=nome_org[:200], tipo="empresa" if body.organizacao.strip() else "individual", politica={})
        db.add(org)
        db.flush()
        papel = "admin"
    user = User(org_id=org.id, email=email, nome=body.nome.strip()[:200], senha_hash=hash_senha(body.senha), papel=papel)
    db.add(user)
    db.flush()
    registra(db, request, "conta_criada", org_id=org.id, user_id=user.id, convite=bool(convite))
    db.commit()
    _define_cookie(resp, user)
    return eu_payload(db, Ctx(user, org, "web"))


@router.post("/entrar")
def entrar(body: LoginIn, request: Request, resp: Response, db: Session = Depends(get_db)):
    ip = ip_cliente(request)
    email = body.email.strip().lower()
    if not limitador.permite(f"login:{ip}:{email}", 8, 300):
        raise HTTPException(429, "Muitas tentativas de entrada. Aguarde alguns minutos.")
    user = db.scalar(select(User).where(User.email == email))
    ok = confere_senha(body.senha, user.senha_hash if user else _HASH_FALSO)
    if not user or not ok or not user.ativo:
        if user:
            registra(db, request, "login_falhou", org_id=user.org_id, user_id=user.id)
            db.commit()
        raise HTTPException(401, "E-mail ou senha incorretos.")
    user.ultimo_login = agora()
    registra(db, request, "login", org_id=user.org_id, user_id=user.id)
    db.commit()
    _define_cookie(resp, user)
    org = db.get(Org, user.org_id)
    billing.garante_credito_mensal(db, org)
    db.commit()
    return eu_payload(db, Ctx(user, org, "web"))


@router.post("/sair")
def sair(resp: Response):
    resp.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/sessao")
def sessao(request: Request, db: Session = Depends(get_db)):
    """Sondagem de sessão para o carregamento do aplicativo: sempre responde 200."""
    token = request.cookies.get(COOKIE)
    uid = le_sessao(token) if token else None
    user = db.get(User, uid) if uid else None
    if user is None or not user.ativo:
        return {"autenticado": False}
    org = db.get(Org, user.org_id)
    billing.garante_credito_mensal(db, org)
    db.commit()
    return {"autenticado": True, **eu_payload(db, Ctx(user, org, "web"))}


@router.get("/eu")
def eu(ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    return eu_payload(db, ctx)


@router.post("/onboarding")
def onboarding(ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    ctx.user.onboarding_ok = True
    db.commit()
    return {"ok": True}


@router.put("/senha")
def troca_senha(body: SenhaIn, request: Request, ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    if not confere_senha(body.senha_atual, ctx.user.senha_hash):
        raise HTTPException(403, "Senha atual incorreta.")
    erro = senha_valida(body.senha_nova)
    if erro:
        raise HTTPException(422, erro)
    ctx.user.senha_hash = hash_senha(body.senha_nova)
    registra(db, request, "senha_alterada", ctx)
    db.commit()
    return {"ok": True}
