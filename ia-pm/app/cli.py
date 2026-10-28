"""Comandos de manutenção: python -m app.cli <comando>."""
from __future__ import annotations

import argparse
import sys
from datetime import timedelta

from sqlalchemy import delete, select

from .db import init_db, session_scope
from .models import AuditEvent, Execution, Org, User, Validation, agora
from .security import hash_senha, senha_valida


def purge(dias: int) -> None:
    """Remove execuções (e validações) mais antigas que o prazo de retenção, conforme a política de dados."""
    limite = agora() - timedelta(days=dias)
    with session_scope() as db:
        ids = [x for x in db.scalars(select(Execution.id).where(Execution.criado_em < limite))]
        if ids:
            db.execute(delete(Validation).where(Validation.execution_id.in_(ids)))
            db.execute(delete(Execution).where(Execution.id.in_(ids)))
        db.execute(delete(AuditEvent).where(AuditEvent.criado_em < agora() - timedelta(days=max(dias, 365))))
    print(f"{len(ids)} execução(ões) removida(s) (anteriores a {dias} dias).")


def cria_admin(email: str, senha: str) -> None:
    erro = senha_valida(senha)
    if erro:
        sys.exit(erro)
    with session_scope() as db:
        if db.scalar(select(User).where(User.email == email.lower())):
            sys.exit("Já existe um usuário com este e-mail.")
        org = Org(nome="IA PM (equipe)", tipo="empresa", plano_id="corporativo", plano_origem="admin", politica={})
        db.add(org)
        db.flush()
        db.add(User(org_id=org.id, email=email.lower(), nome="Administração IA PM", senha_hash=hash_senha(senha),
                    papel="admin", is_staff=True, onboarding_ok=True))
    print("Administrador criado.")


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m app.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("purge", help="aplica a retenção de dados")
    p1.add_argument("--dias", type=int, default=None)
    p2 = sub.add_parser("criar-admin", help="cria um usuário da equipe da plataforma")
    p2.add_argument("email")
    p2.add_argument("senha")
    a = ap.parse_args()
    init_db()
    if a.cmd == "purge":
        from .config import settings
        purge(a.dias or settings.retencao_dias)
    elif a.cmd == "criar-admin":
        cria_admin(a.email, a.senha)


if __name__ == "__main__":
    main()
