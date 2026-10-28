from __future__ import annotations

import secrets
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import billing
from ..catalog import plano
from ..config import PLANOS, settings
from ..db import get_db
from ..deps import Ctx, contexto, exige_admin_org, registra
from ..engine import llm
from ..models import ApiKey, CreditEntry, Execution, Invite, User, agora
from ..schemas import (ByokIn, ChaveApiIn, CheckoutIn, CompraCreditosIn, ConviteIn, PoliticaIn, ResgateIn)
from ..security import cifra, decifra, hash_token, nova_chave_api, novo_token
from .auth import eu_payload

router = APIRouter(prefix="/v1", tags=["conta"])


def _erro(e: billing.ErroNegocio) -> HTTPException:
    return HTTPException(e.status, {"codigo": e.codigo, "mensagem": e.mensagem})


# ------------------------------------------------------------------ planos e cobrança
@router.get("/planos")
def planos():
    return {
        "planos": PLANOS["planos"], "pacotes_creditos": PLANOS["pacotes_creditos"], "hipotese": PLANOS["hipotese"],
        "cobranca": settings.billing_mode, "moeda": PLANOS["moeda"], "dias_leitor_padrao": PLANOS["dias_leitor_padrao"],
    }


@router.get("/conta")
def conta(ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    return eu_payload(db, ctx)


@router.post("/assinatura/resgatar")
def resgatar(body: ResgateIn, request: Request, ctx: Ctx = Depends(exige_admin_org), db: Session = Depends(get_db)):
    from ..ratelimit import limitador
    from ..deps import ip_cliente

    if not limitador.permite(f"resgate:{ctx.org.id}:{ip_cliente(request)}", 8, 600):
        raise HTTPException(429, "Muitas tentativas. Aguarde alguns minutos.")
    try:
        r = billing.resgata_codigo(db, ctx.org, body.codigo)
    except billing.ErroNegocio as e:
        raise _erro(e) from e
    registra(db, request, "codigo_resgatado", ctx, plano=r["plano"])
    db.commit()
    return {**r, "conta": eu_payload(db, ctx)}


@router.post("/assinatura/checkout")
def checkout(body: CheckoutIn, request: Request, ctx: Ctx = Depends(exige_admin_org), db: Session = Depends(get_db)):
    try:
        r = billing.checkout_demo(db, ctx.org, body.plano_id, body.meses)
    except billing.ErroNegocio as e:
        raise _erro(e) from e
    registra(db, request, "checkout_demo", ctx, plano=body.plano_id, meses=body.meses)
    db.commit()
    return {**r, "conta": eu_payload(db, ctx)}


@router.post("/creditos/comprar")
def comprar(body: CompraCreditosIn, request: Request, ctx: Ctx = Depends(exige_admin_org), db: Session = Depends(get_db)):
    try:
        r = billing.compra_creditos_demo(db, ctx.org, body.pacote_id)
    except billing.ErroNegocio as e:
        raise _erro(e) from e
    registra(db, request, "compra_creditos_demo", ctx, pacote=body.pacote_id)
    db.commit()
    return r


@router.get("/creditos")
def extrato(ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    rows = db.scalars(select(CreditEntry).where(CreditEntry.org_id == ctx.org.id).order_by(CreditEntry.id.desc()).limit(100)).all()
    return {
        "saldo": billing.saldo(db, ctx.org.id),
        "lancamentos": [{"id": r.id, "delta": r.delta, "motivo": r.motivo, "descricao": r.descricao,
                         "saldo_apos": r.saldo_apos, "criado_em": r.criado_em.isoformat()} for r in rows],
    }


@router.get("/uso")
def uso(ctx: Ctx = Depends(contexto), db: Session = Depends(get_db), dias: int = 30):
    dias = max(1, min(dias, 365))
    desde = agora() - timedelta(days=dias)
    cond = [Execution.org_id == ctx.org.id, Execution.criado_em >= desde]
    if ctx.user.papel != "admin":
        cond.append(Execution.user_id == ctx.user.id)
    rows = db.scalars(select(Execution).where(*cond)).all()
    por_dia: dict[str, dict] = defaultdict(lambda: {"execucoes": 0, "creditos": 0})
    por_prompt: dict[str, dict] = defaultdict(lambda: {"titulo": "", "execucoes": 0, "creditos": 0})
    tot = {"execucoes": 0, "concluidas": 0, "erros": 0, "creditos": 0, "tokens_in": 0, "tokens_out": 0, "custo_usd": 0.0}
    for e in rows:
        d = e.criado_em.strftime("%Y-%m-%d")
        por_dia[d]["execucoes"] += 1
        por_dia[d]["creditos"] += e.creditos_cobrados
        pp = por_prompt[e.prompt_id]
        pp["titulo"], pp["execucoes"], pp["creditos"] = e.prompt_titulo, pp["execucoes"] + 1, pp["creditos"] + e.creditos_cobrados
        tot["execucoes"] += 1
        tot["concluidas"] += e.status == "concluida"
        tot["erros"] += e.status == "erro"
        tot["creditos"] += e.creditos_cobrados
        tot["tokens_in"] += e.tokens_in
        tot["tokens_out"] += e.tokens_out
        tot["custo_usd"] += e.custo_usd
    tot["custo_usd"] = round(tot["custo_usd"], 4)
    return {
        "periodo_dias": dias, "total": tot,
        "por_dia": [{"dia": k, **v} for k, v in sorted(por_dia.items())],
        "por_prompt": sorted(({"prompt_id": k, **v} for k, v in por_prompt.items()), key=lambda x: -x["execucoes"]),
        "saldo": billing.saldo(db, ctx.org.id),
    }


# ------------------------------------------------------------------ BYOK
@router.put("/conta/byok")
def define_byok(body: ByokIn, request: Request, ctx: Ctx = Depends(exige_admin_org), db: Session = Depends(get_db)):
    if not billing.plano_efetivo(db, ctx.org)["byok"]:
        raise HTTPException(403, "O plano atual não permite chave própria.")
    chave = body.chave.strip()
    if not chave.startswith("sk-ant-") or " " in chave:
        raise HTTPException(422, "A chave deve começar com 'sk-ant-' e não pode conter espaços.")
    ctx.org.byok_provider = "anthropic"
    ctx.org.byok_key_enc = cifra(chave)
    ctx.org.byok_last4 = chave[-4:]
    registra(db, request, "byok_definida", ctx)
    db.commit()
    return {"configurado": True, "final": ctx.org.byok_last4}


@router.delete("/conta/byok")
def remove_byok(request: Request, ctx: Ctx = Depends(exige_admin_org), db: Session = Depends(get_db)):
    ctx.org.byok_provider = ctx.org.byok_key_enc = ctx.org.byok_last4 = None
    registra(db, request, "byok_removida", ctx)
    db.commit()
    return {"configurado": False}


@router.post("/conta/byok/testar")
def testa_byok(ctx: Ctx = Depends(exige_admin_org)):
    if not ctx.org.byok_key_enc:
        raise HTTPException(422, "Nenhuma chave cadastrada.")
    chave = decifra(ctx.org.byok_key_enc)
    if not chave:
        raise HTTPException(422, "Não foi possível ler a chave cadastrada. Cadastre-a novamente.")
    ok, msg = llm.testa_chave_anthropic(chave)
    return {"ok": ok, "mensagem": msg}


# ------------------------------------------------------------------ chaves de API da organização
@router.get("/chaves")
def lista_chaves(ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    q = select(ApiKey).where(ApiKey.org_id == ctx.org.id, ApiKey.revogado_em.is_(None))
    if ctx.user.papel != "admin":
        q = q.where(ApiKey.user_id == ctx.user.id)
    rows = db.scalars(q.order_by(ApiKey.criado_em.desc())).all()
    return {"chaves": [{"id": k.id, "nome": k.nome, "prefixo": k.prefixo, "criado_em": k.criado_em.isoformat(),
                        "ultimo_uso": k.ultimo_uso.isoformat() if k.ultimo_uso else None} for k in rows]}


@router.post("/chaves", status_code=201)
def cria_chave(body: ChaveApiIn, request: Request, ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    if ctx.canal == "api":
        raise HTTPException(403, "Chaves de API só podem ser criadas pela interface web.")
    if not billing.plano_efetivo(db, ctx.org)["api"]:
        raise HTTPException(403, "O plano atual não inclui acesso por API. Disponível a partir do nível Leitor.")
    ativas = len(db.scalars(select(ApiKey).where(ApiKey.org_id == ctx.org.id, ApiKey.revogado_em.is_(None))).all())
    if ativas >= 20:
        raise HTTPException(409, "Limite de 20 chaves ativas por organização.")
    chave, prefixo, h = nova_chave_api()
    k = ApiKey(org_id=ctx.org.id, user_id=ctx.user.id, nome=body.nome.strip(), prefixo=prefixo, key_hash=h)
    db.add(k)
    registra(db, request, "chave_api_criada", ctx, nome=k.nome)
    db.commit()
    return {"id": k.id, "nome": k.nome, "prefixo": prefixo, "chave": chave,
            "aviso": "Copie a chave agora. Por segurança, ela não será exibida novamente."}


@router.delete("/chaves/{chave_id}")
def revoga_chave(chave_id: str, request: Request, ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    k = db.get(ApiKey, chave_id)
    if k is None or k.org_id != ctx.org.id or (ctx.user.papel != "admin" and k.user_id != ctx.user.id):
        raise HTTPException(404, "Chave não encontrada.")
    k.revogado_em = agora()
    registra(db, request, "chave_api_revogada", ctx, nome=k.nome)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ organização
@router.get("/org/membros")
def membros(ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    users = db.scalars(select(User).where(User.org_id == ctx.org.id).order_by(User.criado_em)).all()
    convites = db.scalars(select(Invite).where(Invite.org_id == ctx.org.id, Invite.usado_em.is_(None)).order_by(Invite.criado_em.desc())).all()
    p = billing.plano_efetivo(db, ctx.org)
    return {
        "assentos": {"usados": len(users), "total": p["assentos"]},
        "membros": [{"id": u.id, "nome": u.nome, "email": u.email, "papel": u.papel, "ativo": u.ativo,
                     "ultimo_login": u.ultimo_login.isoformat() if u.ultimo_login else None} for u in users],
        "convites": [{"id": c.id, "email": c.email, "papel": c.papel, "expira_em": c.expira_em.isoformat()} for c in convites],
    }


@router.post("/org/convites", status_code=201)
def convida(body: ConviteIn, request: Request, ctx: Ctx = Depends(exige_admin_org), db: Session = Depends(get_db)):
    p = billing.plano_efetivo(db, ctx.org)
    usados = len(db.scalars(select(User).where(User.org_id == ctx.org.id)).all())
    if usados >= p["assentos"]:
        raise HTTPException(409, f"O plano {p['nome']} permite {p['assentos']} usuário(s). Para convidar mais pessoas, contrate o plano Equipe.")
    email = body.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Já existe uma conta com este e-mail.")
    token = novo_token()
    db.add(Invite(org_id=ctx.org.id, token_hash=hash_token(token), email=email,
                  papel="admin" if body.papel == "admin" else "membro", expira_em=agora() + timedelta(days=7)))
    registra(db, request, "convite_criado", ctx, email=email)
    db.commit()
    return {"email": email, "convite": token, "expira_em_dias": 7,
            "instrucao": "Envie este código à pessoa convidada. Ela o informa ao criar a conta, com o mesmo e-mail."}


@router.delete("/org/membros/{user_id}")
def remove_membro(user_id: str, request: Request, ctx: Ctx = Depends(exige_admin_org), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None or u.org_id != ctx.org.id:
        raise HTTPException(404, "Usuário não encontrado.")
    if u.id == ctx.user.id:
        raise HTTPException(409, "Você não pode remover a si mesmo.")
    u.ativo = False
    registra(db, request, "membro_desativado", ctx, email=u.email)
    db.commit()
    return {"ok": True}


@router.put("/org/politica")
def politica(body: PoliticaIn, request: Request, ctx: Ctx = Depends(exige_admin_org), db: Session = Depends(get_db)):
    ctx.org.politica = {**(ctx.org.politica or {}), "permitir_restrita_byok": body.permitir_restrita_byok}
    registra(db, request, "politica_alterada", ctx, permitir_restrita_byok=body.permitir_restrita_byok)
    db.commit()
    return {"politica": ctx.org.politica}
