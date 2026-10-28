from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..config import SERVICOS
from ..db import get_db
from ..deps import ip_cliente
from ..models import Lead
from ..ratelimit import limitador
from ..schemas import LeadIn

router = APIRouter(prefix="/v1", tags=["serviços"])
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.get("/servicos")
def servicos():
    return SERVICOS


@router.post("/servicos/solicitar", status_code=201)
def solicitar(body: LeadIn, request: Request, db: Session = Depends(get_db)):
    if not limitador.permite(f"lead:{ip_cliente(request)}", 5, 3600):
        raise HTTPException(429, "Muitas solicitações. Tente novamente mais tarde.")
    if not _EMAIL.match(body.email.strip()):
        raise HTTPException(422, "Informe um e-mail válido.")
    if body.servico_id and body.servico_id not in {s["id"] for s in SERVICOS["servicos"]}:
        raise HTTPException(422, "Serviço inexistente.")
    db.add(Lead(tipo="servico" if body.servico_id else "contato", nome=body.nome.strip(), email=body.email.strip().lower(),
                empresa=body.empresa.strip(), servico_id=body.servico_id, mensagem=body.mensagem.strip()))
    db.commit()
    return {"ok": True, "mensagem": "Recebemos o seu pedido. Entraremos em contato pelo e-mail informado."}
