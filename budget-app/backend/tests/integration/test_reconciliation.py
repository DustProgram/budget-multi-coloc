"""Import de relevé + rapprochement + boîte « À valider » + API agent."""
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from main import app
from models.base import Base, SessionLocal, engine
from models import (
    Account, AccountMember, AccountMemberRole, AccountType, BankTransaction,
    Charge, ChannelLink, Frequency, Income, Purchase, SplitMode, User,
)
from services.channel_links import reset as reset_codes
from services.charge_splits import regenerate_splits

JAN = date(2026, 1, 1)


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def me(client):
    return client.get("/api/users/me").json()["user_id"]


@pytest.fixture
def perso(me):
    db = SessionLocal()
    try:
        acc = Account(user_id=me, bank="BRED", type=AccountType.COURANT, name="BRED perso",
                      initial_balance=Decimal("0"))
        db.add(acc)
        db.flush()
        db.add_all([
            Charge(user_id=me, label="Loyer", total_amount=Decimal("650"), frequency=Frequency.MENSUELLE,
                   day_of_month=5, account_id=acc.id, valid_from=JAN),
            Income(user_id=me, source="Salaire", amount=Decimal("2000"), day_of_month=28,
                   account_id=acc.id, valid_from=JAN),
            Purchase(user_id=me, date=date(2026, 3, 3), description="Leclerc (ticket)",
                     total_amount=Decimal("47.32"), account_id=acc.id),
        ])
        db.commit()
        yield acc.id
    finally:
        db.close()


def _csv(*lines: str) -> bytes:
    return ("Date;Libellé;Montant\n" + "\n".join(lines) + "\n").encode()


def _import(client, account_id, content: bytes, name="releve.csv"):
    return client.post("/api/bank/import", data={"account_id": str(account_id)},
                       files={"file": (name, content, "text/csv")})


def _txs(account_id):
    db = SessionLocal()
    try:
        return {t.label: t for t in db.query(BankTransaction).filter(BankTransaction.account_id == account_id)}
    finally:
        db.close()


STATEMENT = _csv(
    "03/03/2026;CB LECLERC 03/03;-47,32",
    "05/03/2026;PRLV SEPA SCI DU PARC;-650,00",
    "06/03/2026;CB CARREFOUR CITY 06/03;-23,10",
    "28/03/2026;VIR ACME SALAIRE MARS;2 000,00",
)


def test_import_matches_declarations(client, perso):
    r = _import(client, perso, STATEMENT)
    assert r.status_code == 200, r.text
    body = r.json()
    assert {k: body[k] for k in ("imported", "duplicates", "matched", "to_review")} == \
        {"imported": 4, "duplicates": 0, "matched": 3, "to_review": 1}
    t = _txs(perso)
    assert t["PRLV SEPA SCI DU PARC"].match_kind == "charge"
    assert t["VIR ACME SALAIRE MARS"].match_kind == "income"
    assert t["CB LECLERC 03/03"].match_kind == "purchase"
    assert t["CB CARREFOUR CITY 06/03"].status == "to_review"

    # Réimporter le même relevé ne crée pas de doublon
    assert _import(client, perso, STATEMENT).json()["duplicates"] == 4


def test_resolve_with_rule_learns(client, perso):
    _import(client, perso, STATEMENT)
    inbox = [t for t in client.get("/api/bank/inbox").json() if t["account_id"] == perso]
    assert len(inbox) == 1
    item = inbox[0]
    keys = [o["key"] for o in item["options"]]
    assert "new_purchase" in keys and "new_charge" in keys and "ignore" in keys
    assert item["suggested_pattern"] == "CB CARREFOUR CITY"

    r = client.post(f"/api/bank/transactions/{item['id']}/resolve", json={
        "option": "new_purchase", "category": "Alimentation",
        "create_rule": True, "rule_pattern": "CARREFOUR",
    })
    assert r.status_code == 200, r.text
    assert r.json()["match_kind"] == "purchase"

    # Mois suivant : la règle crée l'achat toute seule, avec la catégorie
    r = _import(client, perso, _csv("09/04/2026;CB CARREFOUR MARKET 09/04;-61,80"))
    assert r.json()["matched"] == 1
    db = SessionLocal()
    try:
        tx = db.query(BankTransaction).filter(BankTransaction.label.like("%MARKET%")).one()
        p = db.get(Purchase, tx.match_id)
        assert p.category == "Alimentation" and p.total_amount == Decimal("61.80")
        assert tx.rule_id is not None
    finally:
        db.close()


def test_new_charge_declares_and_matches(client, perso):
    _import(client, perso, _csv("12/03/2026;PRLV FREE MOBILE;-19,99"))
    tx = _txs(perso)["PRLV FREE MOBILE"]
    r = client.post(f"/api/bank/transactions/{tx.id}/resolve", json={"option": "new_charge", "label": "Forfait mobile"})
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        ch = db.get(Charge, r.json()["match_id"])
        assert ch.label == "Forfait mobile" and ch.total_amount == Decimal("19.99") and ch.day_of_month == 12
    finally:
        db.close()
    # Le mois suivant, la nouvelle charge déclarée suffit à rapprocher
    assert _import(client, perso, _csv("12/04/2026;PRLV FREE MOBILE;-19,99")).json()["matched"] == 1


def test_wrong_target_rejected(client, perso):
    _import(client, perso, _csv("15/03/2026;CB DIVERS;-5,00"))
    tx = _txs(perso)["CB DIVERS"]
    r = client.post(f"/api/bank/transactions/{tx.id}/resolve", json={"option": "income:999999"})
    assert r.status_code == 422


@pytest.fixture
def joint(me):
    db = SessionLocal()
    try:
        camille = db.query(User).filter(User.ha_user_id == "test-camille").first()
        if not camille:
            camille = User(ha_user_id="test-camille", ha_username="camille", display_name="Camille Dupont")
            db.add(camille)
            db.flush()
        acc = Account(user_id=me, bank="Sumeria", type=AccountType.JOINT, name="Joint coloc",
                      initial_balance=Decimal("0"))
        db.add(acc)
        db.flush()
        db.add(AccountMember(account_id=acc.id, user_id=camille.id, role=AccountMemberRole.COTITULAIRE))
        loyer = Charge(user_id=me, label="Loyer coloc", total_amount=Decimal("900"),
                       frequency=Frequency.MENSUELLE, day_of_month=5, split_mode=SplitMode.EGAL,
                       account_id=acc.id, valid_from=JAN)
        db.add(loyer)
        db.flush()
        regenerate_splits(db, loyer)
        db.commit()
        yield acc.id, camille.id
    finally:
        db.close()


def test_joint_contribution_from_bank(client, me, joint):
    acc_id, camille_id = joint
    r = _import(client, acc_id, _csv(
        "02/03/2026;VIR SEPA RECU DE CAMILLE DUPONT;450,00",
        "05/03/2026;PRLV SCI LOYER;-900,00",
    ))
    assert r.json()["matched"] == 2, r.json()
    t = _txs(acc_id)
    assert t["VIR SEPA RECU DE CAMILLE DUPONT"].contributor_user_id == camille_id

    rows = client.get(f"/api/accounts/{acc_id}/contributions?year=2026&month=3").json()
    by_user = {row["user_id"]: row for row in rows}
    assert by_user[camille_id]["from_bank"] is True
    assert Decimal(by_user[camille_id]["actual"]) == Decimal("450")
    assert Decimal(by_user[me]["balance"]) == Decimal("-450")  # je n'ai pas encore abondé


# ============================================================
# Agent (Hermes / n8n)
# ============================================================

TOKEN = "agent-test-token-0123456789"
H = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def agent_env(monkeypatch, me):
    monkeypatch.setenv("AGENT_API_TOKEN", TOKEN)
    reset_codes()
    db = SessionLocal()
    try:
        db.query(ChannelLink).delete()
        db.get(User, me).notify_channel = "app"
        db.commit()
    finally:
        db.close()


def test_agent_requires_token(client, monkeypatch):
    monkeypatch.delenv("AGENT_API_TOKEN", raising=False)
    assert client.get("/api/agent/pending", headers=H).status_code == 503
    monkeypatch.setenv("AGENT_API_TOKEN", TOKEN)
    assert client.get("/api/agent/pending", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_agent_link_pending_and_resolve(client, agent_env, perso, me):
    who = {"channel": "discord", "handle": "123456789"}
    assert client.post("/api/agent/whoami", headers=H, json=who).status_code == 404

    code = client.post("/api/channels/link-code", json={"channel": "discord"}).json()["code"]
    assert client.post("/api/agent/link", headers=H, json={**who, "code": "000000" if code != "000000" else "111111"}).status_code == 400
    r = client.post("/api/agent/link", headers=H, json={**who, "code": code})
    assert r.status_code == 200, r.text
    assert r.json()["notify_channel"] == "discord"
    # Code à usage unique
    assert client.post("/api/agent/link", headers=H, json={**who, "code": code}).status_code == 400
    assert client.get("/api/channels/").json()["notify_channel"] == "discord"

    _import(client, perso, _csv("20/03/2026;CB FNAC;-89,99"))
    tx_id = _txs(perso)["CB FNAC"].id
    groups = client.get("/api/agent/pending", headers=H).json()
    mine = next(g for g in groups if g["user_id"] == me)
    assert mine["channel"] == "discord" and mine["handle"] == "123456789"
    item = next(i for i in mine["items"] if i["id"] == tx_id)
    assert "89,99" in item["question"]

    client.post("/api/agent/notified", headers=H, json={"ids": [tx_id]})
    groups = client.get("/api/agent/pending", headers=H).json()
    assert all(i["id"] != tx_id for g in groups for i in g["items"])

    r = client.post(f"/api/agent/transactions/{tx_id}/resolve", headers=H,
                    json={**who, "option": "new_purchase", "category": "Tech"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "matched"


def test_agent_statement_import_asks_account(client, agent_env, perso):
    import base64
    db = SessionLocal()
    try:
        u = db.get(Account, perso).user_id
        db.add(ChannelLink(user_id=u, channel="imessage", handle="+33600000000"))
        db.commit()
    finally:
        db.close()
    who = {"channel": "imessage", "handle": "+33600000000"}
    body = {**who, "filename": "releve.csv",
            "content_b64": base64.b64encode(_csv("21/03/2026;CB BOULANGERIE;-4,20")).decode()}
    r = client.post("/api/agent/statements", headers=H, json=body)
    assert r.status_code == 422
    assert any(a["id"] == perso for a in r.json()["detail"]["accounts"])
    r = client.post("/api/agent/statements", headers=H, json={**body, "account_id": perso})
    assert r.status_code == 200 and r.json()["imported"] == 1
