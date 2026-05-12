"""Tests d'intégration pour les comptes joints multi-utilisateurs :
auto-création des ChargeSplit selon le mode, settle/unsettle, min-cash-flow.
"""
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models.base import Base
from models import (
    User, Account, AccountMember, AccountMemberRole,
    Charge, ChargeSplit, AccountType, Frequency, SplitMode,
)
from services.charge_splits import regenerate_splits
from services.coloc_split import compute_coloc_breakdown


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def trio(db):
    """3 colocs Lucas/Camille/Naïm avec un compte joint."""
    lucas = User(ha_user_id="ha-lucas", ha_username="lucas", display_name="Lucas", is_admin=True)
    camille = User(ha_user_id="ha-camille", ha_username="camille", display_name="Camille")
    naim = User(ha_user_id="ha-naim", ha_username="naim", display_name="Naïm")
    db.add_all([lucas, camille, naim])
    db.flush()

    joint = Account(
        user_id=lucas.id, bank="Crédit Mutuel",
        type=AccountType.JOINT, name="Joint Coloc",
        initial_balance=Decimal("0"),
    )
    db.add(joint)
    db.flush()

    db.add_all([
        AccountMember(account_id=joint.id, user_id=camille.id, role=AccountMemberRole.COTITULAIRE),
        AccountMember(account_id=joint.id, user_id=naim.id, role=AccountMemberRole.COTITULAIRE),
    ])
    db.commit()
    return lucas, camille, naim, joint


def test_egal_creates_three_splits(db, trio):
    """Une charge Égale sur un compte joint à 3 → 3 splits équitables."""
    lucas, camille, naim, joint = trio
    loyer = Charge(
        user_id=lucas.id, label="Loyer", total_amount=Decimal("1320"),
        frequency=Frequency.MENSUELLE, day_of_month=5,
        split_mode=SplitMode.EGAL, account_id=joint.id,
    )
    db.add(loyer)
    db.flush()
    regenerate_splits(db, loyer)
    db.commit()

    splits = db.query(ChargeSplit).filter(ChargeSplit.charge_id == loyer.id).all()
    assert len(splits) == 3
    total = sum(Decimal(s.amount) for s in splits)
    assert total == Decimal("1320")
    # Chacun ≈ 440 (avec ajustement du dernier pour l'arrondi)
    for s in splits:
        assert Decimal("439.99") <= Decimal(s.amount) <= Decimal("440.02")


def test_perso_creates_no_split(db, trio):
    lucas, _, _, joint = trio
    netflix = Charge(
        user_id=lucas.id, label="Netflix", total_amount=Decimal("18"),
        frequency=Frequency.MENSUELLE, day_of_month=22,
        split_mode=SplitMode.PERSO, account_id=joint.id,
    )
    db.add(netflix)
    db.flush()
    regenerate_splits(db, netflix)
    db.commit()
    assert db.query(ChargeSplit).filter(ChargeSplit.charge_id == netflix.id).count() == 0


def test_breakdown_with_min_cash_flow(db, trio):
    """Loyer 1320 payé par Lucas, Internet 30 payé par Camille, Eau 48 par Naïm,
    tout en Égal/3 → solde + min-cash-flow doit produire ≤ 2 virements."""
    lucas, camille, naim, joint = trio

    for payer, label, amount in [
        (lucas, "Loyer", "1320"),
        (camille, "Internet", "30"),
        (naim, "Eau", "48"),
    ]:
        ch = Charge(
            user_id=payer.id, label=label, total_amount=Decimal(amount),
            frequency=Frequency.MENSUELLE, day_of_month=5,
            split_mode=SplitMode.EGAL, account_id=joint.id,
        )
        db.add(ch)
        db.flush()
        regenerate_splits(db, ch)
    db.commit()

    data = compute_coloc_breakdown(db, 2026, 5)
    summaries = {s.user_id: s for s in data["summaries"]}
    # Total payé : Lucas 1320, Camille 30, Naïm 48 — total 1398
    # Chacun doit 1398/3 = 466
    assert summaries[lucas.id].total_paid == Decimal("1320.00")
    assert summaries[camille.id].total_paid == Decimal("30.00")
    assert summaries[naim.id].total_paid == Decimal("48.00")

    # Min-cash-flow : Naïm est le plus débiteur (-418), Camille (-436), Lucas créditeur (+854)
    # Algo : 436 de Camille→Lucas, puis 418 de Naïm→Lucas. 2 transferts max.
    assert len(data["debts"]) <= 2
    total_transferred = sum(d["amount"] for d in data["debts"])
    # La somme transférée doit absorber les soldes négatifs
    assert abs(float(total_transferred) - (436 + 418)) < 2


def test_settle_excludes_from_due(db, trio):
    """Si un split est settled, il n'est plus comptabilisé dans le 'dû'."""
    lucas, camille, naim, joint = trio
    loyer = Charge(
        user_id=lucas.id, label="Loyer", total_amount=Decimal("1320"),
        frequency=Frequency.MENSUELLE, day_of_month=5,
        split_mode=SplitMode.EGAL, account_id=joint.id,
    )
    db.add(loyer)
    db.flush()
    regenerate_splits(db, loyer)

    # Naïm rembourse sa part — on settle son split
    from datetime import datetime
    naim_split = db.query(ChargeSplit).filter(
        ChargeSplit.charge_id == loyer.id,
        ChargeSplit.user_id == naim.id,
    ).first()
    naim_split.settled_at = datetime.utcnow()
    db.commit()

    data = compute_coloc_breakdown(db, 2026, 5)
    summaries = {s.user_id: s for s in data["summaries"]}
    # Naïm a settle → son "total_due" est 0
    assert summaries[naim.id].total_due == Decimal("0.00")
    # Camille n'a pas settle → son "total_due" reste sa part
    assert summaries[camille.id].total_due > Decimal("0")


def test_pourcentage_mode(db, trio):
    """Mode Pourcentage : le payeur paie X%, le reste divisé entre les autres."""
    lucas, camille, naim, joint = trio
    ch = Charge(
        user_id=lucas.id, label="Abo box", total_amount=Decimal("100"),
        frequency=Frequency.MENSUELLE, day_of_month=10,
        split_mode=SplitMode.POURCENTAGE, split_value=Decimal("60"),
        account_id=joint.id,
    )
    db.add(ch)
    db.flush()
    regenerate_splits(db, ch)
    db.commit()

    splits = {s.user_id: Decimal(s.amount) for s in
              db.query(ChargeSplit).filter(ChargeSplit.charge_id == ch.id).all()}
    assert splits[lucas.id] == Decimal("60.00")
    # 40 restant / 2 autres = 20 chacun
    assert splits[camille.id] == Decimal("20.00")
    assert splits[naim.id] == Decimal("20.00")


def test_solo_account_no_splits(db):
    """Compte sans AccountMember → pas de split même si split_mode=EGAL."""
    u = User(ha_user_id="solo", ha_username="solo", display_name="Solo")
    db.add(u)
    db.flush()
    acc = Account(user_id=u.id, bank="X", type=AccountType.COURANT, name="Perso",
                  initial_balance=Decimal("0"))
    db.add(acc)
    db.flush()

    ch = Charge(
        user_id=u.id, label="Solo", total_amount=Decimal("100"),
        frequency=Frequency.MENSUELLE, day_of_month=5,
        split_mode=SplitMode.EGAL, num_colocs=3, account_id=acc.id,
    )
    db.add(ch)
    db.flush()
    regenerate_splits(db, ch)
    db.commit()

    assert db.query(ChargeSplit).filter(ChargeSplit.charge_id == ch.id).count() == 0
