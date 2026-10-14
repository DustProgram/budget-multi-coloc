"""Enveloppes vie quotidienne : calcul de la marge, part commune, seuil des gros achats."""
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models.base import Base
from models import (
    Account, AccountMember, AccountMemberRole, AccountType, BankTransaction, Charge, Envelope,
    Frequency, Income, SplitMode, User,
)
from services import envelopes, reconciliation as rec
from services.budget_cache import invalidate_all
from services.budget_calc import compute_monthly_budget
from services.charge_splits import regenerate_splits
from services.joint_contributions import compute_joint_contributions
from services.statement_parsers import ParsedTx

JAN = date(2026, 1, 1)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    invalidate_all()
    yield s
    s.close()
    invalidate_all()


@pytest.fixture
def setup(db):
    a = User(ha_user_id="a", ha_username="alice", display_name="Alice")
    b = User(ha_user_id="b", ha_username="bob", display_name="Bob")
    db.add_all([a, b])
    db.flush()
    perso = Account(user_id=a.id, bank="BRED", type=AccountType.COURANT, name="Perso", initial_balance=0)
    joint = Account(user_id=a.id, bank="Sumeria", type=AccountType.JOINT, name="Coloc", initial_balance=0)
    db.add_all([perso, joint])
    db.flush()
    db.add(AccountMember(account_id=joint.id, user_id=b.id, role=AccountMemberRole.COTITULAIRE))
    db.add(Income(user_id=a.id, source="Salaire", amount=Decimal("2000"), day_of_month=1,
                  account_id=perso.id, valid_from=JAN))
    loyer = Charge(user_id=a.id, label="Loyer", total_amount=Decimal("1000"), frequency=Frequency.MENSUELLE,
                   day_of_month=5, split_mode=SplitMode.EGAL, num_colocs=2, account_id=joint.id,
                   valid_from=JAN)
    db.add(loyer)
    db.flush()
    regenerate_splits(db, loyer)
    db.add_all([
        Envelope(user_id=a.id, label="Mon quotidien", monthly_amount=Decimal("400"),
                 big_purchase_threshold=Decimal("100")),
        Envelope(account_id=joint.id, label="Courses coloc", monthly_amount=Decimal("300"),
                 big_purchase_threshold=Decimal("80")),
    ])
    db.commit()
    return a, b, perso, joint


def test_margin_subtracts_envelopes(db, setup):
    a, *_ = setup
    bud = compute_monthly_budget(db, a.id, 2026, 9)
    assert bud.envelope_perso == Decimal("400")
    assert bud.envelope_common_share == Decimal("150")  # 300 / 2 colocs
    # 2000 − 500 (ma part du loyer) − 400 − 150
    assert bud.available_for_purchases == Decimal("950")


def test_common_envelope_counts_in_expected_contributions(db, setup):
    a, b, _, joint = setup
    rows = {r.user_id: r for r in compute_joint_contributions(db, joint.id, 2026, 9)}
    assert rows[b.id].expected == Decimal("650")  # 500 de loyer + 150 de courses


def test_small_spending_goes_to_envelope_big_one_asks(db, setup):
    a, b, perso, joint = setup
    rec.import_transactions(db, a, perso.id, [
        ParsedTx(date(2026, 9, 3), "CB BOULANGERIE", Decimal("-4.20")),
        ParsedTx(date(2026, 9, 4), "CB UBER EATS", Decimal("-28.90")),
        ParsedTx(date(2026, 9, 6), "CB FNAC CASQUE", Decimal("-149.00")),   # ≥ 100 € : on demande
        ParsedTx(date(2026, 9, 8), "CB UBER EATS REMBOURSEMENT", Decimal("8.90")),
    ], "csv")
    rec.import_transactions(db, a, joint.id, [
        ParsedTx(date(2026, 9, 7), "CB CARREFOUR", Decimal("-62.40")),
        ParsedTx(date(2026, 9, 14), "CB CARREFOUR", Decimal("-95.00")),     # ≥ 80 € sur le joint
    ], "csv")
    txs = {t.label: t for t in db.query(BankTransaction).all()}
    assert txs["CB BOULANGERIE"].match_kind == "daily"
    assert txs["CB FNAC CASQUE"].status == "to_review"
    assert "daily" in [o["key"] for o in rec.options_for(db, txs["CB FNAC CASQUE"])]

    # Un remboursement se valide en « quotidien » et vient en déduction
    rec.resolve(db, txs["CB UBER EATS REMBOURSEMENT"], a, "daily")
    st = {e["scope"]: e for e in envelopes.statuses(db, a, 2026, 9, today=date(2026, 9, 20))}
    assert st["perso"]["spent"] == Decimal("24.20")          # 4,20 + 28,90 − 8,90
    assert st["perso"]["remaining"] == Decimal("375.80")
    assert st["perso"]["days_left"] == 11 and st["perso"]["per_day"] == Decimal("34.16")
    assert st["commune"]["spent"] == Decimal("62.40")


def test_no_envelope_keeps_asking(db, setup):
    a, b, perso, _ = setup
    db.query(Envelope).delete()
    db.commit()
    rec.import_transactions(db, a, perso.id, [ParsedTx(date(2026, 9, 3), "CB CAFE", Decimal("-3.00"))], "csv")
    assert db.query(BankTransaction).one().status == "to_review"
