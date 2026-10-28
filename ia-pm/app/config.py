"""Configuração do IA PM, lida de variáveis de ambiente (prefixo IAPM_).

Nenhum segredo fica no repositório: chaves de IA, chave de assinatura de sessão
e credenciais de administrador vêm do ambiente.
"""
from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content"
WEB_DIR = BASE_DIR / "web"


def _env(name: str, default: str = "") -> str:
    """Variável de ambiente; valor vazio conta como ausente (comum em arquivos .env)."""
    v = os.environ.get(name)
    return default if v is None or not v.strip() else v.strip()


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None or not v.strip():
        return default
    return v.strip().lower() in ("1", "true", "sim", "yes", "on")


def _load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


@dataclass
class Settings:
    env: str = field(default_factory=lambda: _env("IAPM_ENV", "dev"))
    database_url: str = field(
        default_factory=lambda: _env("IAPM_DATABASE_URL", f"sqlite:///{BASE_DIR / 'data' / 'iapm.db'}")
    )
    secret_key: str = field(default_factory=lambda: _env("IAPM_SECRET_KEY"))
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    usd_brl: float = field(default_factory=lambda: float(_env("IAPM_USD_BRL", "5.50")))
    billing_mode: str = field(default_factory=lambda: _env("IAPM_BILLING_MODE", "demo"))
    allow_signup: bool = field(default_factory=lambda: _bool("IAPM_ALLOW_SIGNUP", True))
    admin_email: str = field(default_factory=lambda: _env("IAPM_ADMIN_EMAIL"))
    admin_password: str = field(default_factory=lambda: _env("IAPM_ADMIN_PASSWORD"))
    retencao_dias: int = field(default_factory=lambda: int(_env("IAPM_RETENCAO_DIAS", "365")))
    enable_fallbacks: bool = field(default_factory=lambda: _bool("IAPM_ENABLE_FALLBACKS", True))
    docs_enabled: bool = field(default_factory=lambda: _bool("IAPM_DOCS", True))
    cookie_secure: bool | None = None
    max_tokens_saida: int = field(default_factory=lambda: int(_env("IAPM_MAX_TOKENS", "32000")))
    sessao_horas: int = field(default_factory=lambda: int(_env("IAPM_SESSAO_HORAS", "12")))

    def __post_init__(self):
        if not self.secret_key:
            if self.env == "prod":
                raise RuntimeError("IAPM_SECRET_KEY é obrigatória em produção (use um valor aleatório longo).")
            # Em desenvolvimento, gera uma chave por processo (as sessões caem a cada reinício).
            self.secret_key = secrets.token_urlsafe(48)
        if self.cookie_secure is None:
            self.cookie_secure = _bool("IAPM_COOKIE_SECURE", self.env == "prod")

    @property
    def is_prod(self) -> bool:
        return self.env == "prod"


settings = Settings()

# Conteúdo versionado (editável sem mexer em código).
TAXONOMIA = _load_json(CONTENT_DIR / "taxonomia.json")
PLANOS = _load_json(CONTENT_DIR / "planos.json")
SERVICOS = _load_json(CONTENT_DIR / "servicos.json")
MODELOS = _load_json(CONTENT_DIR / "modelos.json")
