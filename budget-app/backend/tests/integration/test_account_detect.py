"""Import en masse : le compte de chaque relevé est reconnu par son numéro."""
import io
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from main import app
from models import Account, AccountType, BankTransaction
from models.base import Base, SessionLocal, engine
from services.account_detect import statement_refs

# IBAN fictifs à clé valide
IBAN_A = "FR03 3000 4000 3100 0123 4567 821"
IBAN_B = "FR17 1010 7001 2300 9876 5432 155"
IBAN_UNKNOWN = "FR85 4061 8000 0100 0555 5555 507"


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def accounts(client):
    me = client.get("/api/users/me").json()["user_id"]
    db = SessionLocal()
    try:
        db.query(Account).filter(Account.statement_ref.isnot(None)).update({Account.statement_ref: None})
        a = Account(user_id=me, bank="BRED", type=AccountType.COURANT, name="Détection A", initial_balance=Decimal("0"))
        b = Account(user_id=me, bank="Sumeria", type=AccountType.COURANT, name="Détection B", initial_balance=Decimal("0"))
        db.add_all([a, b])
        db.commit()
        yield a.id, b.id
    finally:
        db.close()


def _csv(iban: str, *lines: str) -> bytes:
    return (f"Relevé de compte\nIBAN : {iban}\n\nDate;Libellé;Montant\n" + "\n".join(lines) + "\n").encode()


def _import(client, content: bytes, account_id=None, name="releve.csv"):
    data = {"account_id": str(account_id)} if account_id else {}
    return client.post("/api/bank/import", data=data, files={"file": (name, content, "text/csv")})


def _count(account_id):
    db = SessionLocal()
    try:
        return db.query(BankTransaction).filter(BankTransaction.account_id == account_id).count()
    finally:
        db.close()


def test_refs_from_iban_ofx_and_csv_header():
    assert statement_refs("r.csv", _csv(IBAN_A)) == ["00012345678"]
    # Clé fausse : ignoré (évite de prendre n'importe quelle suite de chiffres)
    assert statement_refs("r.csv", _csv("FR00 3000 4000 3100 0123 4567 821")) == []
    ofx = b"<OFX><BANKACCTFROM><BANKID>30004<ACCTID>00012345678<ACCTTYPE>CHECKING</BANKACCTFROM></OFX>"
    assert statement_refs("r.ofx", ofx) == ["00012345678"]
    assert statement_refs("r.csv", b"Numero de compte;00098765432\nDate;Libelle;Montant\n") == ["00098765432"]


def test_refs_from_pdf_header_first():
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(50, 800, f"Relevé de compte - IBAN {IBAN_B}")
    c.drawString(50, 780, f"VIR SEPA vers IBAN {IBAN_A}")
    c.save()
    assert statement_refs("r.pdf", buf.getvalue()) == ["00987654321", "00012345678"]


def test_learn_then_detect(client, accounts):
    a, b = accounts
    # Pas encore appris : on demande le compte
    r = _import(client, _csv(IBAN_A, "02/04/2026;CB BOULANGERIE;-3,10"))
    assert r.status_code == 422 and r.json()["detail"]["code"] == "account_unknown"

    r = _import(client, _csv(IBAN_A, "02/04/2026;CB BOULANGERIE;-3,10"), account_id=a)
    assert r.status_code == 200 and not r.json()["account_detected"]
    r = _import(client, _csv(IBAN_B, "02/04/2026;VIR CAMILLE;400,00"), account_id=b)
    assert r.status_code == 200

    # Ensuite : tout d'un coup, chaque relevé sur son compte
    r = _import(client, _csv(IBAN_A, "05/05/2026;CB PHARMACIE;-12,00"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["account_id"] == a and body["account_detected"] and body["account_name"] == "Détection A"
    r = _import(client, _csv(IBAN_B, "05/05/2026;VIR CAMILLE;400,00"))
    assert r.json()["account_id"] == b
    assert _count(a) == 2 and _count(b) == 2

    r = _import(client, _csv(IBAN_UNKNOWN, "05/05/2026;CB X;-1,00"))
    assert r.status_code == 422


def test_wrong_account_chosen_warns(client, accounts):
    a, b = accounts
    _import(client, _csv(IBAN_A, "02/04/2026;CB BOULANGERIE;-3,10"), account_id=a)
    _import(client, _csv(IBAN_B, "02/04/2026;VIR CAMILLE;400,00"), account_id=b)
    r = _import(client, _csv(IBAN_B, "06/06/2026;VIR CAMILLE;400,00"), account_id=a)
    assert r.status_code == 200
    assert any("Détection B" in w for w in r.json()["warnings"])
