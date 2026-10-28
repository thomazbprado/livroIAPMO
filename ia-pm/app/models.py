from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def agora() -> datetime:
    return datetime.now(timezone.utc)


def novo_id() -> str:
    return uuid.uuid4().hex


class Org(Base):
    __tablename__ = "orgs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=novo_id)
    nome: Mapped[str] = mapped_column(String(200))
    tipo: Mapped[str] = mapped_column(String(20), default="individual")  # individual | empresa
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    plano_id: Mapped[str] = mapped_column(String(40), default="explorar")
    plano_origem: Mapped[str] = mapped_column(String(20), default="gratuito")  # gratuito | livro | assinatura | admin
    plano_valido_ate: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    creditos_ultimo_mes: Mapped[str] = mapped_column(String(7), default="")  # AAAA-MM do último crédito mensal
    byok_provider: Mapped[str | None] = mapped_column(String(20), nullable=True)
    byok_key_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    byok_last4: Mapped[str | None] = mapped_column(String(8), nullable=True)
    politica: Mapped[dict] = mapped_column(JSON, default=dict)  # permitir_restrita_byok, etc.

    usuarios: Mapped[list["User"]] = relationship(back_populates="org")


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=novo_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id"), index=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    nome: Mapped[str] = mapped_column(String(200))
    senha_hash: Mapped[str] = mapped_column(String(300))
    papel: Mapped[str] = mapped_column(String(20), default="admin")  # admin | membro
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    onboarding_ok: Mapped[bool] = mapped_column(Boolean, default=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    ultimo_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    org: Mapped[Org] = relationship(back_populates="usuarios")


class Invite(Base):
    __tablename__ = "invites"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=novo_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    email: Mapped[str] = mapped_column(String(254))
    papel: Mapped[str] = mapped_column(String(20), default="membro")
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    usado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=novo_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    nome: Mapped[str] = mapped_column(String(100))
    prefixo: Mapped[str] = mapped_column(String(16))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    ultimo_uso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revogado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CreditEntry(Base):
    """Livro-razão de créditos. delta > 0 entrada, delta < 0 consumo."""

    __tablename__ = "credit_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id"), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    motivo: Mapped[str] = mapped_column(String(40))  # mensal_plano | compra | consumo | ajuste | cortesia
    ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    descricao: Mapped[str] = mapped_column(String(300), default="")
    saldo_apos: Mapped[int] = mapped_column(Integer, default=0)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Execution(Base):
    __tablename__ = "executions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=novo_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    prompt_id: Mapped[str] = mapped_column(String(120), index=True)
    prompt_versao: Mapped[str] = mapped_column(String(20))
    prompt_titulo: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(20), default="em_andamento")  # em_andamento | concluida | erro
    etapa: Mapped[str] = mapped_column(String(60), default="validando")
    fonte_ia: Mapped[str] = mapped_column(String(12))  # creditos | byok | simulado
    nivel_modelo: Mapped[str] = mapped_column(String(20), default="avancado")
    modelo: Mapped[str] = mapped_column(String(60), default="")
    classificacao_dados: Mapped[str] = mapped_column(String(20))
    finalidade: Mapped[str] = mapped_column(String(300), default="")
    projeto_ref: Mapped[str] = mapped_column(String(200), default="")
    canal: Mapped[str] = mapped_column(String(10), default="web")  # web | api
    variaveis: Mapped[dict] = mapped_column(JSON, default=dict)
    prompt_renderizado: Mapped[str] = mapped_column(Text, default="")
    verificacoes: Mapped[list] = mapped_column(JSON, default=list)
    saida: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    conferencia: Mapped[list] = mapped_column(JSON, default=list)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    custo_usd: Mapped[float] = mapped_column(Float, default=0.0)
    creditos_cobrados: Mapped[int] = mapped_column(Integer, default=0)
    erro: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, index=True)
    concluido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    validacoes: Mapped[list["Validation"]] = relationship(
        back_populates="execucao", order_by="Validation.criado_em"
    )


class Validation(Base):
    """Registro de validação humana e decisão final (Tabela 7.2 do livro)."""

    __tablename__ = "validations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=novo_id)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    decisao: Mapped[str] = mapped_column(String(30))  # aprovada | aprovada_com_ressalvas | rejeitada
    validador_nome: Mapped[str] = mapped_column(String(200))
    validador_papel: Mapped[str] = mapped_column(String(120))
    checklist: Mapped[list] = mapped_column(JSON, default=list)  # [{item, ok}]
    justificativa: Mapped[str] = mapped_column(Text, default="")
    instancia_decisoria: Mapped[str] = mapped_column(String(200), default="")
    condicionantes: Mapped[str] = mapped_column(Text, default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)

    execucao: Mapped[Execution] = relationship(back_populates="validacoes")


class RedeemCode(Base):
    """Código do livro que concede o nível Leitor por um período."""

    __tablename__ = "redeem_codes"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=novo_id)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    dica: Mapped[str] = mapped_column(String(12), default="")  # últimos caracteres, para suporte
    plano_id: Mapped[str] = mapped_column(String(40), default="leitor")
    dias: Mapped[int] = mapped_column(Integer, default=180)
    lote: Mapped[str] = mapped_column(String(60), default="")
    expira_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    usado_por_org: Mapped[str | None] = mapped_column(String(32), nullable=True)
    usado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Lead(Base):
    __tablename__ = "leads"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=novo_id)
    tipo: Mapped[str] = mapped_column(String(20))  # servico | prompt_sugerido | contato
    org_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    nome: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(254))
    empresa: Mapped[str] = mapped_column(String(200), default="")
    servico_id: Mapped[str] = mapped_column(String(60), default="")
    mensagem: Mapped[str] = mapped_column(Text, default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class AuditEvent(Base):
    """Eventos de segurança e administração (login, chaves, BYOK, convites)."""

    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    acao: Mapped[str] = mapped_column(String(60))
    detalhe: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str] = mapped_column(String(64), default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


Index("ix_exec_org_criado", Execution.org_id, Execution.criado_em)
