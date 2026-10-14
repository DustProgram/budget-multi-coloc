from datetime import date
from decimal import Decimal

import pytest

from services.reconciliation import normalize_label, suggest_pattern
from services.statement_parsers import StatementParseError, parse_amount, parse_csv, parse_ofx


def test_parse_amount_formats():
    assert parse_amount("1 234,56") == Decimal("1234.56")
    assert parse_amount("-12,50 €") == Decimal("-12.50")
    assert parse_amount("1.234,56") == Decimal("1234.56")
    assert parse_amount("1,234.56") == Decimal("1234.56")
    assert parse_amount("") is None


def test_csv_with_preamble_and_debit_credit():
    raw = (
        "Compte courant n° 00012345678\n"
        "Solde au 31/03/2026;1 520,30\n"
        "\n"
        "Date;Date valeur;Libellé;Débit;Crédit\n"
        "05/03/2026;05/03/2026;PRLV SEPA SCI DU PARC LOYER MARS;650,00;\n"
        "28/03/2026;28/03/2026;VIR SEPA RECU ACME SALAIRE;;2 000,00\n"
    ).encode("cp1252")
    rows = parse_csv(raw)
    assert [(r.date, r.amount) for r in rows] == [
        (date(2026, 3, 5), Decimal("-650.00")),
        (date(2026, 3, 28), Decimal("2000.00")),
    ]
    assert rows[0].label.startswith("PRLV SEPA SCI")


def test_csv_single_amount_column():
    raw = "Date opération,Libellé,Montant\n2026-03-03,CARREFOUR CITY,\"-23,10\"\n".encode()
    rows = parse_csv(raw)
    assert rows[0].amount == Decimal("-23.10")


def test_csv_without_date_column_fails():
    with pytest.raises(StatementParseError):
        parse_csv(b"foo;bar\n1;2\n")


def test_ofx():
    raw = b"""OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260305<TRNAMT>-650.00<FITID>A1<NAME>PRLV SCI DU PARC
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260328120000<TRNAMT>2000.00<FITID>A2<NAME>VIR ACME<MEMO>SALAIRE MARS
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"""
    rows = parse_ofx(raw)
    assert [(r.external_id, r.amount) for r in rows] == [("A1", Decimal("-650.00")), ("A2", Decimal("2000.00"))]
    assert rows[1].label == "VIR ACME SALAIRE MARS"


def test_normalize_drops_dates_refs_and_months():
    assert normalize_label("VIR SEPA RECU /DE Camille Dupont /MOTIF loyer Mars /REF 2026031245") == \
        "VIR SEPA RECU DE CAMILLE DUPONT MOTIF LOYER REF"
    assert suggest_pattern("CB CARREFOUR CITY 03/03 4974XXXX") == "CB CARREFOUR CITY"


def test_pdf_statement_goes_through_llm(monkeypatch):
    """Relevé PDF (ex : Sumeria) : texte extrait localement puis structuré par le LLM."""
    import io
    from reportlab.pdfgen import canvas
    from services import bank_import
    from services.llm_client import LLMResponse

    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(50, 800, "Releve Sumeria - Mars 2026")
    c.drawString(50, 780, "02/03/2026  Virement de Camille  +450,00")
    c.save()

    seen = {}

    class FakeClient:
        def chat(self, messages, system, tools=None, max_tokens=2048):
            seen["text"] = messages[0]["content"]
            return LLMResponse(text='{"transactions": [{"date": "2026-03-02", '
                                    '"label": "Virement de Camille", "amount": 450.0}]}')

    monkeypatch.setattr(bank_import, "is_llm_available", lambda: True)
    monkeypatch.setattr(bank_import, "get_llm_client", lambda: FakeClient())
    monkeypatch.setattr(bank_import, "check_rate_limits", lambda db: None)
    monkeypatch.setattr(bank_import, "record_usage", lambda *a, **k: None)

    rows, source = bank_import.parse_statement(None, 1, "releve.pdf", buf.getvalue())
    assert source == "pdf-ia"  # pas de colonnes Débit/Crédit → secours IA
    assert "Virement de Camille" in seen["text"]
    assert rows[0].amount == Decimal("450.00") and rows[0].date == date(2026, 3, 2)


def test_pdf_without_llm_gives_clear_error(monkeypatch):
    import io
    from reportlab.pdfgen import canvas
    from services import bank_import

    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(50, 800, "Releve de compte - operations du mois")
    c.save()
    monkeypatch.setattr(bank_import, "is_llm_available", lambda: False)
    with pytest.raises(StatementParseError, match="CSV ou OFX"):
        bank_import.parse_statement(None, 1, "releve.pdf", buf.getvalue())
