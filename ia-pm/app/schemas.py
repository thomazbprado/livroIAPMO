from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class RegistroIn(BaseModel):
    email: str = Field(max_length=254)
    senha: str = Field(max_length=200)
    nome: str = Field(min_length=2, max_length=200)
    organizacao: str = Field(default="", max_length=200)
    convite: str = Field(default="", max_length=200)


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    senha: str = Field(max_length=200)


class SenhaIn(BaseModel):
    senha_atual: str = Field(max_length=200)
    senha_nova: str = Field(max_length=200)


class PreviaIn(BaseModel):
    variaveis: dict[str, Any] = Field(default_factory=dict)
    nivel_modelo: str | None = None


class ExecutarIn(BaseModel):
    variaveis: dict[str, Any] = Field(default_factory=dict)
    classificacao_dados: str = Field(default="", max_length=20)
    finalidade: str = Field(default="", max_length=300)
    projeto_ref: str = Field(default="", max_length=200)
    fonte_ia: str | None = Field(default=None, max_length=12)
    nivel_modelo: str | None = Field(default=None, max_length=20)
    aguardar: bool = False


class ChecklistItem(BaseModel):
    item: str = Field(max_length=300)
    ok: bool


class ValidacaoIn(BaseModel):
    decisao: str = Field(max_length=30)
    validador_nome: str = Field(default="", max_length=200)
    validador_papel: str = Field(default="", max_length=120)
    checklist: list[ChecklistItem] = Field(default_factory=list, max_length=30)
    justificativa: str = Field(default="", max_length=4000)
    instancia_decisoria: str = Field(default="", max_length=200)
    condicionantes: str = Field(default="", max_length=4000)


class ByokIn(BaseModel):
    chave: str = Field(min_length=20, max_length=300)


class ChaveApiIn(BaseModel):
    nome: str = Field(min_length=2, max_length=100)


class ConviteIn(BaseModel):
    email: str = Field(max_length=254)
    papel: str = Field(default="membro", max_length=20)


class PoliticaIn(BaseModel):
    permitir_restrita_byok: bool = False


class ResgateIn(BaseModel):
    codigo: str = Field(min_length=6, max_length=64)


class CheckoutIn(BaseModel):
    plano_id: str = Field(max_length=40)
    meses: int = Field(default=1, ge=1, le=12)


class CompraCreditosIn(BaseModel):
    pacote_id: str = Field(max_length=40)


class LeadIn(BaseModel):
    nome: str = Field(min_length=2, max_length=200)
    email: str = Field(max_length=254)
    empresa: str = Field(default="", max_length=200)
    servico_id: str = Field(default="", max_length=60)
    mensagem: str = Field(default="", max_length=4000)


class SugestaoIn(BaseModel):
    setor: str = Field(max_length=40)
    fase: str = Field(max_length=40)
    descricao: str = Field(min_length=10, max_length=2000)


class CodigosIn(BaseModel):
    quantidade: int = Field(ge=1, le=2000)
    dias: int = Field(default=180, ge=1, le=1100)
    lote: str = Field(default="", max_length=60)
    validade_dias: int | None = Field(default=None, ge=1, le=3650)


class CreditoAdminIn(BaseModel):
    org_id: str = Field(max_length=32)
    creditos: int = Field(ge=-100000, le=1000000)
    motivo: str = Field(default="cortesia", max_length=100)
