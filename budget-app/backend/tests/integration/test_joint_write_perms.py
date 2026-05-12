"""Tests d'intégration : co-titulaires peuvent modifier et supprimer
TOUTE ligne (charge, income, transfer, saving, purchase) liée au compte
joint, pas seulement celles qu'ils ont créées."""
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models.base import Base
from models import (
    User, Account, AccountMember, AccountMemberRole, AccountType,
    Income, Charge, AutoSaving, RecurringTransfer, OneTimeTransfer,
    Purchase, Frequency, SplitMode, IncomeType, PaymentMethod,
)
from services.access import user_can_write_account


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def coloc_setup(db):
    """Compte joint Lucas (owner) + Camille (cotitulaire) + Naïm (cotitulaire)."""
    from datetime import date
    lucas = User(ha_user_id="ha-lucas", ha_username="lucas", display_name="Lucas")
    camille = User(ha_user_id="ha-camille", ha_username="camille", display_name="Camille")
    naim = User(ha_user_id="ha-naim", ha_username="naim", display_name="Naïm")
    db.add_all([lucas, camille, naim])
    db.flush()

    joint = Account(
        user_id=lucas.id, bank="CM", type=AccountType.JOINT,
        name="Joint", initial_balance=Decimal("0"),
    )
    db.add(joint)
    db.flush()
    db.add_all([
        AccountMember(account_id=joint.id, user_id=camille.id, role=AccountMemberRole.COTITULAIRE),
        AccountMember(account_id=joint.id, user_id=naim.id, role=AccountMemberRole.COTITULAIRE),
    ])

    # Lucas crée une charge, un income, des virements, etc. sur le compte joint
    db.add(Charge(
        user_id=lucas.id, label="Loyer", total_amount=Decimal("1200"),
        frequency=Frequency.MENSUELLE, day_of_month=5,
        split_mode=SplitMode.EGAL, account_id=joint.id,
    ))
    db.add(Income(
        user_id=lucas.id, source="APL coloc", amount=Decimal("400"),
        day_of_month=5, type=IncomeType.REGULIER, account_id=joint.id,
    ))
    db.add(AutoSaving(
        user_id=lucas.id, label="Épargne coloc", amount=Decimal("50"),
        source_account_id=joint.id, dest_account_id=joint.id,
        day_of_month=30,
    ))
    db.add(RecurringTransfer(
        user_id=lucas.id, label="Provision",
        source_account_id=joint.id, dest_account_id=joint.id,
        amount=Decimal("100"), day_of_month=1,
    ))
    db.add(Purchase(
        user_id=lucas.id, date=date(2026, 5, 15), description="Frigo coloc",
        total_amount=Decimal("450"), nb_installments=3,
        account_id=joint.id, payment_method=PaymentMethod.CB,
    ))
    db.commit()
    return lucas, camille, naim, joint


def test_cotitulaire_can_write_joint_account(db, coloc_setup):
    """Le helper user_can_write_account doit dire OUI pour un cotitulaire."""
    _lucas, camille, naim, joint = coloc_setup
    assert user_can_write_account(db, camille.id, joint.id) is True
    assert user_can_write_account(db, naim.id, joint.id) is True


def test_non_member_cannot_write(db, coloc_setup):
    """Un user étranger au compte joint ne peut pas écrire."""
    _lucas, _camille, _naim, joint = coloc_setup
    other = User(ha_user_id="ha-bob", ha_username="bob", display_name="Bob")
    db.add(other)
    db.commit()
    assert user_can_write_account(db, other.id, joint.id) is False


def test_viewer_cannot_write(db):
    """Un membre avec rôle VIEWER ne peut pas écrire."""
    lucas = User(ha_user_id="ha-lucas", ha_username="lucas")
    visitor = User(ha_user_id="ha-vis", ha_username="visitor")
    db.add_all([lucas, visitor])
    db.flush()
    acc = Account(
        user_id=lucas.id, bank="X", type=AccountType.JOINT,
        name="J", initial_balance=Decimal("0"),
    )
    db.add(acc)
    db.flush()
    db.add(AccountMember(account_id=acc.id, user_id=visitor.id, role=AccountMemberRole.VIEWER))
    db.commit()

    assert user_can_write_account(db, lucas.id, acc.id) is True
    assert user_can_write_account(db, visitor.id, acc.id) is False
