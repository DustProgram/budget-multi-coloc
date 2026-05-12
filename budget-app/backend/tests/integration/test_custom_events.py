"""Tests d'intégration pour les CustomEvent (rappels non-bancaires)."""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from main import app
from models.base import Base, SessionLocal, engine
from models import CustomEvent, User


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def wipe():
    db = SessionLocal()
    try:
        db.query(CustomEvent).delete()
        db.commit()
    finally:
        db.close()


def test_create_and_list_perso_event(client):
    r = client.post("/api/custom-events/", json={
        "date": "2026-05-20",
        "label": "Rendez-vous médecin",
        "kind": "perso",
    })
    assert r.status_code == 201, r.text
    assert r.json()["label"] == "Rendez-vous médecin"
    assert r.json()["is_shared"] is False

    r = client.get("/api/custom-events/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_shared_event_requires_account_id(client):
    """is_shared=True sans account_id → 400."""
    r = client.post("/api/custom-events/", json={
        "date": "2026-05-20",
        "label": "Apéro",
        "kind": "coloc",
        "is_shared": True,
    })
    assert r.status_code == 400


def test_filter_by_date_range(client):
    client.post("/api/custom-events/", json={"date": "2026-05-01", "label": "A"})
    client.post("/api/custom-events/", json={"date": "2026-05-15", "label": "B"})
    client.post("/api/custom-events/", json={"date": "2026-06-01", "label": "C"})

    r = client.get("/api/custom-events/?from_date=2026-05-10&to_date=2026-05-31")
    labels = [ev["label"] for ev in r.json()]
    assert labels == ["B"]


def test_only_creator_can_delete(client):
    r = client.post("/api/custom-events/", json={"date": "2026-05-20", "label": "X"})
    event_id = r.json()["id"]
    r = client.delete(f"/api/custom-events/{event_id}")
    assert r.status_code == 204
