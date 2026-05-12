"""Benchmark simple des endpoints critiques.

Mesure la latence (p50, p95, p99) sur 200 itérations pour chaque endpoint.
Utilise TestClient (in-process, pas de réseau) donc mesure surtout le coût
SQLAlchemy + Pydantic + middleware, pas le coût réseau.

Usage : DEV_MODE=true .venv/bin/python scripts/bench.py
"""
import os
import sys
import time
from pathlib import Path
from statistics import median

# Setup : DEV_MODE + chemin
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DEV_MODE", "true")
os.environ.setdefault("DATABASE_URL", "sqlite:///./bench.db?check_same_thread=False")

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from models import (  # noqa: E402
    Account, AccountMember, AccountMemberRole, AccountType,
    Charge, Frequency, Household, HouseholdMember, Message,
    SplitMode, User,
)
from models.base import Base, SessionLocal, engine  # noqa: E402

Base.metadata.create_all(engine)


def seed():
    """Crée des données réalistes : 3 users, 1 compte joint, 20 charges,
    50 messages chat, 100 articles courses."""
    from decimal import Decimal
    db = SessionLocal()
    try:
        db.query(Message).delete()
        db.query(Charge).delete()
        db.query(AccountMember).delete()
        db.query(HouseholdMember).delete()
        db.query(Household).delete()
        db.query(Account).delete()
        db.query(User).filter(User.ha_user_id != "dev-user-id").delete()
        db.commit()

        lucas = db.query(User).filter(User.ha_user_id == "dev-user-id").first()
        if not lucas:
            lucas = User(ha_user_id="dev-user-id", ha_username="dev", display_name="Lucas")
            db.add(lucas)
            db.flush()
        camille = User(ha_user_id="ha-cam", ha_username="cam", display_name="Camille")
        naim = User(ha_user_id="ha-naim", ha_username="naim", display_name="Naïm")
        db.add_all([camille, naim])
        db.flush()

        # Compte joint
        joint = Account(
            user_id=lucas.id, bank="CM", type=AccountType.JOINT,
            name="Joint coloc", initial_balance=Decimal("500"),
        )
        db.add(joint)
        db.flush()
        db.add_all([
            AccountMember(account_id=joint.id, user_id=camille.id, role=AccountMemberRole.COTITULAIRE),
            AccountMember(account_id=joint.id, user_id=naim.id, role=AccountMemberRole.COTITULAIRE),
        ])

        # 20 charges
        for i in range(20):
            db.add(Charge(
                user_id=lucas.id, label=f"Charge {i}",
                total_amount=Decimal("60") + Decimal(i),
                frequency=Frequency.MENSUELLE, day_of_month=(i % 28) + 1,
                split_mode=SplitMode.EGAL, account_id=joint.id,
            ))

        # Foyer + 50 messages
        h = Household(name="Foyer test", created_by_user_id=lucas.id)
        db.add(h)
        db.flush()
        db.add_all([
            HouseholdMember(household_id=h.id, user_id=lucas.id),
            HouseholdMember(household_id=h.id, user_id=camille.id),
            HouseholdMember(household_id=h.id, user_id=naim.id),
        ])
        for i in range(50):
            db.add(Message(
                household_id=h.id, user_id=[lucas.id, camille.id, naim.id][i % 3],
                body=f"Message bench {i}",
            ))

        db.commit()
    finally:
        db.close()


def bench(client: TestClient, name: str, method: str, path: str, n: int = 200, **kw):
    # Warm-up
    for _ in range(5):
        getattr(client, method)(path, **kw)

    times = []
    for _ in range(n):
        t0 = time.perf_counter()
        r = getattr(client, method)(path, **kw)
        times.append((time.perf_counter() - t0) * 1000)
        if r.status_code >= 400:
            print(f"  {name}: WARN status={r.status_code} body={r.text[:120]}")
            return
    times.sort()
    p50 = median(times)
    p95 = times[int(0.95 * n)]
    p99 = times[int(0.99 * n)]
    print(f"  {name:42s} p50={p50:6.2f}ms  p95={p95:6.2f}ms  p99={p99:6.2f}ms")


def main():
    seed()
    with TestClient(app) as client:
        print("=== Bench (DEV_MODE, in-process, 200 iter/endpoint) ===")
        bench(client, "GET /api/users/me",             "get", "/api/users/me")
        bench(client, "GET /api/accounts/",            "get", "/api/accounts/")
        bench(client, "GET /api/charges/",             "get", "/api/charges/")
        bench(client, "GET /api/households/me",        "get", "/api/households/me")
        bench(client, "GET /api/households/me/messages","get","/api/households/me/messages")
        bench(client, "GET /api/coloc/breakdown",      "get",
              "/api/coloc/breakdown?year=2026&month=5")
        bench(client, "GET /api/shopping/",            "get", "/api/shopping/")
        bench(client, "GET /api/calendar/upcoming",    "get",
              "/api/calendar/upcoming?days=30")


if __name__ == "__main__":
    main()
