"""Senhas, tokens de sessão, chaves de API e cifragem da chave BYOK.

Somente biblioteca padrão e `cryptography`. Nenhum segredo é registrado em log.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from cryptography.fernet import Fernet, InvalidToken

from .config import settings

# ---------------------------------------------------------------- senhas (scrypt)
_N, _R, _P = 2**14, 8, 1


def hash_senha(senha: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(senha.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return "scrypt$%d$%d$%d$%s$%s" % (_N, _R, _P, base64.b64encode(salt).decode(), base64.b64encode(dk).decode())


def confere_senha(senha: str, armazenado: str) -> bool:
    try:
        _, n, r, p, salt_b64, dk_b64 = armazenado.split("$")
        salt = base64.b64decode(salt_b64)
        esperado = base64.b64decode(dk_b64)
        dk = hashlib.scrypt(senha.encode(), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(esperado))
        return hmac.compare_digest(dk, esperado)
    except Exception:
        return False


def senha_valida(senha: str) -> str | None:
    """Retorna mensagem de erro, ou None se a senha atende à política mínima."""
    if len(senha) < 10:
        return "A senha deve ter pelo menos 10 caracteres."
    if senha.lower() == senha or senha.upper() == senha or not any(c.isdigit() for c in senha):
        return "Use letras maiúsculas e minúsculas e pelo menos um número."
    return None


# ---------------------------------------------------------------- sessão assinada (HMAC)
def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _assina(payload: str) -> str:
    return _b64(hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).digest())


def cria_sessao(user_id: str, horas: int | None = None) -> str:
    exp = int(time.time()) + 3600 * (horas or settings.sessao_horas)
    payload = _b64(json.dumps({"u": user_id, "e": exp}, separators=(",", ":")).encode())
    return f"{payload}.{_assina(payload)}"


def le_sessao(token: str) -> str | None:
    try:
        payload, sig = token.split(".")
        if not hmac.compare_digest(sig, _assina(payload)):
            return None
        dados = json.loads(_unb64(payload))
        if dados["e"] < time.time():
            return None
        return dados["u"]
    except Exception:
        return None


# ---------------------------------------------------------------- chaves de API e tokens opacos
def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def nova_chave_api() -> tuple[str, str, str]:
    """Retorna (chave_completa, prefixo_exibivel, hash). A chave só é exibida uma vez."""
    corpo = secrets.token_urlsafe(32)
    chave = f"ipm_{corpo}"
    return chave, chave[:10], hash_token(chave)


def novo_token(nbytes: int = 24) -> str:
    return secrets.token_urlsafe(nbytes)


# ---------------------------------------------------------------- cifragem da chave BYOK
def _fernet() -> Fernet:
    k = hashlib.sha256(("iapm-byok|" + settings.secret_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(k))


def cifra(texto: str) -> str:
    return _fernet().encrypt(texto.encode()).decode()


def decifra(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None
