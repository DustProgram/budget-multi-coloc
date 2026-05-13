"""Cache mémoire 30s sur les calculs budget par (user_id, year, month).

Invalidation explicite via `invalidate_user(user_id)` à appeler dans tous
les endpoints qui mutent des entités impactant le budget (income, charge,
transfer, saving, purchase, account).

Pour les charges sur compte joint, on doit aussi invalider les co-titulaires
du compte → `invalidate_account(db, account_id)`.

Le cache est par-process (pas Redis) — l'app n'a qu'un seul worker uvicorn
sur HA Green donc c'est suffisant. Une mutation invalide instantanément.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Callable, Optional

# Clé : (user_id, year, month) → (result, expires_at)
_BUDGET_CACHE: dict[tuple[int, int, int], tuple[Any, float]] = {}
_LOCK = threading.Lock()

TTL_SECONDS = 30


def get_or_compute(
    user_id: int, year: int, month: int,
    factory: Callable[[], Any],
) -> Any:
    """Retourne le résultat caché ou appelle factory() et cache 30s."""
    key = (user_id, year, month)
    now = time.monotonic()
    with _LOCK:
        cached = _BUDGET_CACHE.get(key)
        if cached and cached[1] > now:
            return cached[0]
    # Pas de cache OU expiré → recalcul (en-dehors du lock pour ne pas bloquer)
    value = factory()
    with _LOCK:
        _BUDGET_CACHE[key] = (value, now + TTL_SECONDS)
        # Nettoyage opportuniste des entrées expirées (max 50/run)
        expired = [k for k, (_, exp) in list(_BUDGET_CACHE.items())[:50] if exp < now]
        for k in expired:
            _BUDGET_CACHE.pop(k, None)
    return value


def invalidate_user(user_id: int) -> None:
    """Vide tout le cache pour un user (toutes années/mois)."""
    with _LOCK:
        keys_to_del = [k for k in _BUDGET_CACHE if k[0] == user_id]
        for k in keys_to_del:
            _BUDGET_CACHE.pop(k, None)


def invalidate_account(db, account_id: Optional[int]) -> None:
    """Vide le cache pour TOUS les users qui ont accès à ce compte.

    Sert pour les mutations sur des comptes joints : tous les co-titulaires
    doivent voir le changement immédiatement.
    """
    if not account_id:
        invalidate_all()
        return
    from models import Account, AccountMember
    user_ids: set[int] = set()
    acc = db.query(Account).filter(Account.id == account_id).first()
    if acc:
        user_ids.add(acc.user_id)
    for m in db.query(AccountMember).filter(AccountMember.account_id == account_id).all():
        user_ids.add(m.user_id)
    for uid in user_ids:
        invalidate_user(uid)


def invalidate_all() -> None:
    """Vide tout le cache (cas d'urgence ou de migration)."""
    with _LOCK:
        _BUDGET_CACHE.clear()


def attach_sqlalchemy_listeners() -> None:
    """Attache des listeners SQLAlchemy qui invalident le cache à chaque
    mutation des entités impactant le budget. À appeler une fois au
    démarrage (depuis main.py).
    """
    from sqlalchemy import event
    from models import (
        Income, Charge, ChargeSplit, RecurringTransfer, OneTimeTransfer,
        AutoSaving, Purchase, Account, AccountMember,
    )

    def _on_mutation(_mapper, _connection, _target):
        invalidate_all()

    for model in (
        Income, Charge, ChargeSplit, RecurringTransfer, OneTimeTransfer,
        AutoSaving, Purchase, Account, AccountMember,
    ):
        event.listen(model, "after_insert", _on_mutation)
        event.listen(model, "after_update", _on_mutation)
        event.listen(model, "after_delete", _on_mutation)
