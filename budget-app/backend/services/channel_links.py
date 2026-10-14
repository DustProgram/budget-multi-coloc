"""Liaison user ↔ identité de messagerie via code à usage unique.

L'utilisateur génère un code dans l'app puis l'envoie à l'agent depuis sa
messagerie : l'agent transmet le handle qu'il voit réellement. Ainsi
personne ne peut déclarer le Discord / numéro de quelqu'un d'autre.
Codes en mémoire (1 worker), valables 15 min.
"""
from __future__ import annotations

import secrets
import threading
import time
from typing import Optional

CHANNELS = ("discord", "imessage", "whatsapp", "telegram", "signal")
CODE_TTL = 15 * 60

_lock = threading.Lock()
_codes: dict[str, tuple[int, str, float]] = {}


def create_code(user_id: int, channel: str) -> str:
    code = f"{secrets.randbelow(10**6):06d}"
    with _lock:
        now = time.monotonic()
        for k in [k for k, v in _codes.items() if v[2] < now or v[0] == user_id]:
            del _codes[k]
        while code in _codes:
            code = f"{secrets.randbelow(10**6):06d}"
        _codes[code] = (user_id, channel, now + CODE_TTL)
    return code


def consume_code(code: str, channel: str) -> Optional[int]:
    with _lock:
        entry = _codes.get((code or "").strip())
        if not entry or entry[2] < time.monotonic() or entry[1] != channel:
            return None
        del _codes[code.strip()]
        return entry[0]


def reset() -> None:
    with _lock:
        _codes.clear()
