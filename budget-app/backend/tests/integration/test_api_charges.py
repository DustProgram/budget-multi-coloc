"""Regression tests for the charges API endpoint.

The original bug: ChargeOut.model_validate(charge) failed at 500 because
`my_share` is a required field but absent from the SQLAlchemy model - the
old code tried to set it after validation, which raises before the
assignment ever runs.

Each test below exercises the wire-level POST/GET/PATCH so a regression
would resurface as a 500 instead of a passing assertion.
"""
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from main import app
from models.base import Base, SessionLocal, engine
from models import (
    Account, AutoSaving, Charge, Income, OneTimeTransfer, Purchase,
    RecurringTransfer,
)


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


def _wipe_data() -> None:
    """Clear data tables between tests (keeps Settings + auto-created User)."""
    db = SessionLocal()
    try:
        # Delete children before parents to respect FK constraints
        for model in (
            Charge, Purchase, Income, AutoSaving,
            RecurringTransfer, OneTimeTransfer, Account,
        ):
            db.query(model).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture
def account_id(client):
    _wipe_data()
    r = client.post("/api/accounts/", json={
        "bank": "BRED",
        "type": "Compte courant",
        "name": "BRED Courant",
        "initial_balance": "1000.00",
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_post_charge_perso_returns_my_share(client, account_id):
    """Regression: split_mode=Perso → my_share equals total_amount."""
    r = client.post("/api/charges/", json={
        "label": "Gaz",
        "total_amount": "60",
        "day_of_month": 15,
        "split_mode": "Perso",
        "account_id": account_id,
    })
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["label"] == "Gaz"
    assert data["split_mode"] == "Perso"
    assert Decimal(data["my_share"]) == Decimal("60")


def test_post_charge_egal_returns_my_share(client, account_id):
    """Regression: split_mode=Égal divides total by num_colocs."""
    r = client.post("/api/charges/", json={
        "label": "Loyer",
        "total_amount": "900",
        "day_of_month": 5,
        "split_mode": "Égal",
        "num_colocs": 3,
        "account_id": account_id,
    })
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["split_mode"] == "Égal"  # accent preserved through JSON
    assert Decimal(data["my_share"]) == Decimal("300")


def test_post_charge_pourcentage_returns_my_share(client, account_id):
    """Regression: split_mode=Pourcentage applies split_value as %."""
    r = client.post("/api/charges/", json={
        "label": "Élec",
        "total_amount": "100",
        "day_of_month": 10,
        "split_mode": "Pourcentage",
        "split_value": "40",
        "account_id": account_id,
    })
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["my_share"]) == Decimal("40")


def test_post_charge_montant_fixe_returns_my_share(client, account_id):
    """Regression: split_mode=Montant fixe returns split_value verbatim."""
    r = client.post("/api/charges/", json={
        "label": "Eau",
        "total_amount": "50",
        "day_of_month": 20,
        "split_mode": "Montant fixe",
        "split_value": "15",
        "account_id": account_id,
    })
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["my_share"]) == Decimal("15")


def test_get_charges_returns_my_share(client, account_id):
    """Regression: GET / also exercises the _to_out serializer."""
    client.post("/api/charges/", json={
        "label": "Gaz",
        "total_amount": "60",
        "day_of_month": 15,
        "split_mode": "Perso",
        "account_id": account_id,
    })
    r = client.get("/api/charges/")
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == 1
    assert Decimal(items[0]["my_share"]) == Decimal("60")


def test_patch_charge_recomputes_my_share(client, account_id):
    """PATCH must re-run compute_my_share on the updated charge."""
    r = client.post("/api/charges/", json={
        "label": "Internet",
        "total_amount": "30",
        "day_of_month": 5,
        "split_mode": "Égal",
        "num_colocs": 3,
        "account_id": account_id,
    })
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["my_share"]) == Decimal("10")

    charge_id = r.json()["id"]
    r = client.patch(f"/api/charges/{charge_id}", json={"num_colocs": 2})
    assert r.status_code == 200, r.text
    assert Decimal(r.json()["my_share"]) == Decimal("15")  # 30 / 2
