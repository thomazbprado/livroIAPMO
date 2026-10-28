from __future__ import annotations

import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import billing
from ..db import get_db
from ..deps import Ctx, exige_staff, registra
from ..models import Execution, Lead, Org, RedeemCode, User, agora
from ..schemas import CodigosIn, CreditoAdminIn
from ..security import hash_token

router = APIRouter(prefix="/v1/admin", tags=["administração"])
_ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def gera_codigo() -> str:
    g = ["".join(secrets.choice(_ALFABETO) for _ in range(4)) for _ in range(3)]
    return "IAPM-" + "-".join(g)


@router.get("/resumo")
def resumo(ctx: Ctx = Depends(exige_staff), db: Session = Depends(get_db)):
    d30 = agora() - timedelta(days=30)
    return {
        "organizacoes": db.scalar(select(func.count(Org.id))),
        "usuarios": db.scalar(select(func.count(User.id))),
        "execucoes_30d": db.scalar(select(func.count(Execution.id)).where(Execution.criado_em >= d30)),
        "custo_usd_30d": round(db.scalar(select(func.coalesce(func.sum(Execution.custo_usd), 0.0)).where(Execution.criado_em >= d30)) or 0, 4),
        "creditos_consumidos_30d": db.scalar(select(func.coalesce(func.sum(Execution.creditos_cobrados), 0)).where(Execution.criado_em >= d30)),
        "leads": db.scalar(select(func.count(Lead.id))),
        "codigos_total": db.scalar(select(func.count(RedeemCode.id))),
        "codigos_usados": db.scalar(select(func.count(RedeemCode.id)).where(RedeemCode.usado_em.is_not(None))),
    }


@router.post("/codigos", status_code=201)
def gera_codigos(body: CodigosIn, request: Request, ctx: Ctx = Depends(exige_staff), db: Session = Depends(get_db)):
    """Gera códigos Leitor para impressão no livro. Os códigos em texto claro só são devolvidos nesta resposta."""
    codigos: list[str] = []
    expira = agora() + timedelta(days=body.validade_dias) if body.validade_dias else None
    while len(codigos) < body.quantidade:
        c = gera_codigo()
        if c in codigos or db.scalar(select(RedeemCode.id).where(RedeemCode.code_hash == hash_token(c))):
            continue
        codigos.append(c)
        db.add(RedeemCode(code_hash=hash_token(c), dica=c[-4:], plano_id="leitor", dias=body.dias, lote=body.lote, expira_em=expira))
    registra(db, request, "codigos_gerados", ctx, quantidade=body.quantidade, lote=body.lote)
    db.commit()
    return {"quantidade": len(codigos), "dias": body.dias, "lote": body.lote, "codigos": codigos,
            "csv": "codigo,dias,lote\n" + "\n".join(f"{c},{body.dias},{body.lote}" for c in codigos)}


@router.get("/leads")
def leads(ctx: Ctx = Depends(exige_staff), db: Session = Depends(get_db), limite: int = 100):
    rows = db.scalars(select(Lead).order_by(Lead.criado_em.desc()).limit(max(1, min(limite, 500)))).all()
    return {"leads": [{"id": r.id, "tipo": r.tipo, "nome": r.nome, "email": r.email, "empresa": r.empresa,
                       "servico_id": r.servico_id, "mensagem": r.mensagem, "criado_em": r.criado_em.isoformat()} for r in rows]}


@router.get("/usuarios")
def usuarios(ctx: Ctx = Depends(exige_staff), db: Session = Depends(get_db), limite: int = 200):
    rows = db.execute(select(User, Org).join(Org, Org.id == User.org_id).order_by(User.criado_em.desc()).limit(max(1, min(limite, 500)))).all()
    return {"usuarios": [{"id": u.id, "nome": u.nome, "email": u.email, "papel": u.papel, "org_id": o.id, "org": o.nome,
                          "plano": o.plano_id, "plano_origem": o.plano_origem, "creditos": billing.saldo(db, o.id),
                          "criado_em": u.criado_em.isoformat()} for u, o in rows]}


@router.post("/creditos")
def credito(body: CreditoAdminIn, request: Request, ctx: Ctx = Depends(exige_staff), db: Session = Depends(get_db)):
    org = db.get(Org, body.org_id)
    if org is None:
        from fastapi import HTTPException
        raise HTTPException(404, "Organização não encontrada.")
    billing.lanca(db, org.id, body.creditos, "ajuste" if body.creditos < 0 else "cortesia", None, body.motivo)
    registra(db, request, "creditos_ajustados", ctx, org=org.id, creditos=body.creditos)
    db.commit()
    return {"org_id": org.id, "saldo": billing.saldo(db, org.id)}
