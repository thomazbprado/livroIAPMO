"""Planos, créditos e resgate do código do livro.

Cobrança real NÃO está integrada. O modo "demo" (IAPM_BILLING_MODE=demo) ativa planos e compra de
créditos sem pagamento, apenas para demonstração. Em produção, defina IAPM_BILLING_MODE=disabled e
integre um gateway no ponto indicado em `checkout_demo` (veja docs/IMPLANTACAO.md).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .catalog import plano
from .config import PLANOS, settings
from .models import CreditEntry, Org, RedeemCode, agora
from .security import hash_token


class ErroNegocio(Exception):
    def __init__(self, codigo: str, mensagem: str, status: int = 400):
        super().__init__(mensagem)
        self.codigo = codigo
        self.mensagem = mensagem
        self.status = status


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def saldo(db: Session, org_id: str) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(CreditEntry.delta), 0)).where(CreditEntry.org_id == org_id)) or 0)


def lanca(db: Session, org_id: str, delta: int, motivo: str, ref: str | None = None, descricao: str = "") -> CreditEntry:
    novo = saldo(db, org_id) + delta
    e = CreditEntry(org_id=org_id, delta=delta, motivo=motivo, ref=ref, descricao=descricao[:300], saldo_apos=novo)
    db.add(e)
    db.flush()
    return e


def plano_efetivo(db: Session, org: Org) -> dict:
    """Plano vigente. Planos com validade vencida voltam para Explorar."""
    validade = _utc(org.plano_valido_ate)
    if org.plano_id != "explorar" and validade is not None and validade < agora():
        org.plano_id = "explorar"
        org.plano_origem = "gratuito"
        org.plano_valido_ate = None
        db.flush()
    return plano(org.plano_id)


def garante_credito_mensal(db: Session, org: Org) -> None:
    """Concede os créditos mensais do plano uma vez por mês (créditos não vencem durante a vigência)."""
    p = plano_efetivo(db, org)
    mes = agora().strftime("%Y-%m")
    if p["creditos_mensais"] > 0 and org.creditos_ultimo_mes != mes:
        lanca(db, org.id, p["creditos_mensais"], "mensal_plano", mes, f"Créditos mensais do plano {p['nome']}")
        org.creditos_ultimo_mes = mes
        db.flush()


def _concede(db: Session, org: Org, plano_id: str, origem: str, dias: int) -> None:
    base = _utc(org.plano_valido_ate)
    inicio = base if (base and base > agora() and org.plano_id == plano_id) else agora()
    org.plano_id = plano_id
    org.plano_origem = origem
    org.plano_valido_ate = inicio + timedelta(days=dias)
    org.creditos_ultimo_mes = ""  # força a concessão do mês corrente
    db.flush()
    garante_credito_mensal(db, org)


def resgata_codigo(db: Session, org: Org, codigo: str) -> dict:
    cod = db.scalar(select(RedeemCode).where(RedeemCode.code_hash == hash_token(codigo.strip().upper())))
    if cod is None:
        raise ErroNegocio("codigo_invalido", "Código não encontrado. Confira os caracteres impressos no livro.", 404)
    if cod.usado_em is not None:
        raise ErroNegocio("codigo_usado", "Este código já foi utilizado.", 409)
    if cod.expira_em is not None and _utc(cod.expira_em) < agora():
        raise ErroNegocio("codigo_expirado", "Este código expirou.", 410)
    atual = plano_efetivo(db, org)
    alvo = plano(cod.plano_id)
    if atual["nivel"] > alvo["nivel"] and org.plano_origem == "assinatura":
        raise ErroNegocio("plano_superior", f"A organização já tem o plano {atual['nome']}, que inclui o nível {alvo['nome']}.", 409)
    _concede(db, org, cod.plano_id, "livro", cod.dias)
    cod.usado_em = agora()
    cod.usado_por_org = org.id
    db.flush()
    return {"plano": alvo["nome"], "valido_ate": _utc(org.plano_valido_ate).isoformat(), "dias": cod.dias}


def _exige_demo() -> None:
    if settings.billing_mode != "demo":
        raise ErroNegocio(
            "cobranca_indisponivel",
            "A contratação online ainda não está habilitada neste ambiente. Fale com a equipe comercial.",
            503,
        )


def checkout_demo(db: Session, org: Org, plano_id: str, meses: int = 1) -> dict:
    """Ativa um plano sem cobrança (somente modo demo). Ponto de integração do gateway de pagamento."""
    _exige_demo()
    p = plano(plano_id)
    if p["id"] != plano_id or p["preco_mensal_brl"] is None:
        raise ErroNegocio("sob_consulta", "Este plano é contratado sob consulta.", 400)
    if p["nivel"] == 0:
        raise ErroNegocio("plano_gratuito", "O plano Explorar não precisa de contratação.", 400)
    if not 1 <= meses <= 12:
        raise ErroNegocio("meses_invalido", "Informe de 1 a 12 meses.", 400)
    _concede(db, org, p["id"], "assinatura", 30 * meses)
    return {"plano": p["nome"], "valido_ate": _utc(org.plano_valido_ate).isoformat(), "modo": "demo"}


def compra_creditos_demo(db: Session, org: Org, pacote_id: str) -> dict:
    _exige_demo()
    pac = next((x for x in PLANOS["pacotes_creditos"] if x["id"] == pacote_id), None)
    if pac is None:
        raise ErroNegocio("pacote_invalido", "Pacote de créditos inexistente.", 404)
    lanca(db, org.id, pac["creditos"], "compra", pac["id"], f"Pacote de {pac['creditos']} créditos (demonstração)")
    return {"creditos": pac["creditos"], "saldo": saldo(db, org.id), "modo": "demo"}
