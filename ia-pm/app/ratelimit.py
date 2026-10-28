"""Limitador de taxa em memória (janela deslizante).

Atende a um único processo. Em produção com várias instâncias, substitua por Redis
(a interface `permite` é a mesma).
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class Limitador:
    def __init__(self):
        self._eventos: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def permite(self, chave: str, limite: int, janela_s: int = 60) -> bool:
        agora = time.monotonic()
        with self._lock:
            q = self._eventos[chave]
            while q and q[0] <= agora - janela_s:
                q.popleft()
            if len(q) >= limite:
                return False
            q.append(agora)
            return True

    def reinicia(self):
        with self._lock:
            self._eventos.clear()


limitador = Limitador()
