"""Démarrage rapide : 3 mois de relevé importés sans aucune déclaration."""
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from main import app
from models.base import Base, SessionLocal, engine
from models import Account, AccountType, BankTransaction, Charge, Income, MatchingRule, Purchase


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def account(client):
    me = client.get("/api/users/me").json()["user_id"]
    db = SessionLocal()
    try:
        acc = Account(user_id=me, bank="BRED", type=AccountType.COURANT, name="Onboarding", initial_balance=0)
        db.add(acc)
        db.commit()
        yield acc.id
    finally:
        db.close()


def _csv(lines):
    return ("Date;Libellé;Montant\n" + "\n".join(lines) + "\n").encode()


THREE_MONTHS = [
    "01/07/2026;Virement SEPA reçu ACME SALAIRE JUILLET;1 802,10",
    "01/08/2026;Virement SEPA reçu ACME SALAIRE AOUT;1 845,33",
    "01/09/2026;Virement SEPA reçu ACME SALAIRE SEPTEMBRE;1 790,00",
    "18/07/2026;Prélèvement SEPA FREE MOBILE 1051983434642;-19,99",
    "18/08/2026;Prélèvement SEPA FREE MOBILE 1052005937483;-19,99",
    "18/09/2026;Prélèvement SEPA FREE MOBILE 1052104455671;-19,99",
    "03/07/2026;Carte netflix.com le 02/07/26;-13,49",
    "03/08/2026;Carte netflix.com le 02/08/26;-13,49",
    "03/09/2026;Carte netflix.com le 02/09/26;-13,49",
    "10/07/2026;Carte mcdonald's paris;-9,80",
    "11/08/2026;Carte mcdonald's paris;-9,80",
    "12/09/2026;Carte mcdonald's paris;-9,80",
    "15/08/2026;Carte librairie des lilas;-12,00",
    "20/08/2026;Virement instantané émis dev user bousfrppxxx;-50,00",
    "21/08/2026;Facture CB crédit remboursement sncf;23,40",
]


def test_suggestions_then_apply(client, account):
    r = client.post("/api/bank/import", data={"account_id": str(account)},
                    files={"file": ("releve.csv", _csv(THREE_MONTHS), "text/csv")})
    assert r.json()["to_review"] == len(THREE_MONTHS)

    groups = client.get(f"/api/bank/onboarding?account_id={account}").json()
    by = {(g["kind"], g["pattern"]): g for g in groups}
    assert ("new_income", "ACME SALAIRE") in by and by[("new_income", "ACME SALAIRE")]["count"] == 3
    assert ("new_charge", "FREE MOBILE") in by
    assert ("new_charge", "NETFLIX") in by                       # abonnement carte connu
    mcdo = next(g for g in groups if g["pattern"].startswith("MCDONALD"))
    assert mcdo["kind"] == "new_purchase" and mcdo["category"] == "Restaurants"  # pas une « charge »
    own = next(g for g in groups if "BOUSFRPPXXX" in g["pattern"])
    assert own["kind"] == "ignore"
    assert next(g for g in groups if "LIBRAIRIE" in g["pattern"])["category"] == "Autre"

    r = client.post("/api/bank/onboarding/apply", json={"groups": [
        {"tx_ids": g["tx_ids"], "kind": g["kind"], "label": g["label"], "category": g["category"],
         "amount": g["amount"], "create_rule": True, "pattern": g["pattern"]}
        for g in groups
    ]})
    assert r.status_code == 200, r.text
    assert r.json() == {"applied": len(THREE_MONTHS), "errors": []}

    db = SessionLocal()
    try:
        assert db.query(BankTransaction).filter(
            BankTransaction.account_id == account, BankTransaction.status == "to_review").count() == 0
        salary = db.query(Income).filter(Income.account_id == account).one()
        assert salary.amount == Decimal("1802.10") and salary.valid_from.month == 7  # médiane, dès juillet
        assert {c.label for c in db.query(Charge).filter(Charge.account_id == account)} == {"Free Mobile", "Netflix"}
        assert db.query(Purchase).filter(Purchase.account_id == account, Purchase.category == "Restaurants").count() == 3
        assert db.query(MatchingRule).filter(MatchingRule.account_id == account).count() == len(groups)
    finally:
        db.close()

    # Le mois suivant, tout se range tout seul
    r = client.post("/api/bank/import", data={"account_id": str(account)}, files={"file": ("oct.csv", _csv([
        "01/10/2026;Virement SEPA reçu ACME SALAIRE OCTOBRE;1 811,00",
        "18/10/2026;Prélèvement SEPA FREE MOBILE 1052200000001;-19,99",
        "03/10/2026;Carte netflix.com le 02/10/26;-13,49",
        "14/10/2026;Carte mcdonald's paris;-11,20",
    ]), "text/csv")})
    assert r.json()["matched"] == 4, r.json()


def test_joint_account_credits_become_contributions(client):
    from datetime import date
    from models import AccountMember, AccountMemberRole, User
    from services.joint_contributions import compute_joint_contributions

    me = client.get("/api/users/me").json()["user_id"]
    db = SessionLocal()
    try:
        lea = db.query(User).filter(User.ha_user_id == "test-lea").first() or User(
            ha_user_id="test-lea", ha_username="lea", display_name="Léa")
        db.add(lea)
        db.flush()
        acc = Account(user_id=me, bank="Sumeria", type=AccountType.JOINT, name="Coloc onboarding",
                      initial_balance=0)
        db.add(acc)
        db.flush()
        db.add(AccountMember(account_id=acc.id, user_id=lea.id, role=AccountMemberRole.COTITULAIRE))
        # Insérées « à trier » directement : on teste le tri groupé, pas le rapprochement à l'import
        for i, (d, amt) in enumerate([(date(2026, 9, 4), "450.00"), (date(2026, 10, 3), "455.00")]):
            db.add(BankTransaction(account_id=acc.id, imported_by_user_id=me, date=d, amount=Decimal(amt),
                                   label="Virement SEPA reçu de MME LEA DUPONT pour Loyer", source="pdf",
                                   fingerprint=f"lea-{i}", status="to_review"))
        db.commit()
        acc_id, lea_id = acc.id, lea.id
    finally:
        db.close()

    groups = client.get(f"/api/bank/onboarding?account_id={acc_id}").json()
    g = next(g for g in groups if g["kind"] == "contribution")
    assert g["contributor_user_id"] == lea_id and g["count"] == 2 and g["label"] == "Abondement de Léa"

    r = client.post("/api/bank/onboarding/apply", json={"groups": [{
        "tx_ids": g["tx_ids"], "kind": "contribution", "label": g["label"], "create_rule": True,
        "pattern": g["pattern"], "contributor_user_id": lea_id,
    }]})
    assert r.json() == {"applied": 2, "errors": []}
    db = SessionLocal()
    try:
        sept = {c.user_id: c for c in compute_joint_contributions(db, acc_id, 2026, 9)}
        assert sept[lea_id].actual == Decimal("450.00") and sept[lea_id].from_bank
        rule = db.query(MatchingRule).filter(MatchingRule.account_id == acc_id).one()
        assert rule.match_kind == "contribution" and rule.amount_min is None  # le montant varie
    finally:
        db.close()
