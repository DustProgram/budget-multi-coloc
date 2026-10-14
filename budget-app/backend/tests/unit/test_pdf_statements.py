"""Lecture locale d'un relevé PDF à colonnes (format type BRED), généré ici."""
import io
from datetime import date
from decimal import Decimal

from reportlab.pdfgen import canvas

from services.pdf_statements import parse_pdf_columns


def _bred_like(closing: str = "1.256,14") -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(60, 800, "Relevé de comptes - 25 septembre 2026")
    y = 700
    for x, word in ((53, "Date"), (300, "Référence"), (383, "Débit"), (481, "Crédit"), (520, "Valeur")):
        c.drawString(x, y, word)
    y -= 15
    c.drawString(52, y, "26.08")
    c.drawString(150, y, "Solde précédent")
    c.drawRightString(540, y, "386,86")
    ops = [
        ("27.08", "Carte", "6238194", "17,37", "debit", ["boulangerie du parc le 25/08/26 cb.xxxxx3390 / origine :",
                                                        "france / montant : 17,37 eur"]),
        ("28.08", "Virement SEPA reçu", "2977083", "1.250,00", "credit", ["acme sas salaire"]),
        ("05.09", "Prélèvement SEPA", "2985115", "363,35", "debit", ["sci du parc loyer"]),
    ]
    for d, label, ref, amt, side, details in ops:
        y -= 14
        c.drawString(52, y, d)
        c.drawString(95, y, label)
        c.drawString(300, y, ref)
        c.drawRightString(440 if side == "debit" else 505, y, amt)
        c.drawString(530, y, d + ".26")
        for det in details:
            y -= 10
            c.drawString(92, y, det)
    y -= 16
    c.drawString(52, y, "Total des mouvements")
    c.drawRightString(440, y, "380,72")
    c.drawRightString(505, y, "1.250,00")
    y -= 12
    c.drawString(52, y, "Nouveau solde")
    c.drawRightString(540, y, closing)
    y -= 20
    c.drawString(52, y, "Relevé d'opérations poste annexe")
    c.drawString(53, y - 12, "Date")
    c.drawString(383, y - 12, "Débit")
    c.drawString(481, y - 12, "Crédit")
    c.drawString(52, y - 26, "05.09")
    c.drawString(95, y - 26, "Virement automatique livret")
    c.drawRightString(505, y - 26, "100,00")
    c.save()
    return buf.getvalue()


def test_columns_signs_labels_and_balance_check():
    res = parse_pdf_columns(_bred_like())
    assert res.opening == Decimal("386.86") and res.closing == Decimal("1256.14")
    assert res.verified is True
    assert [(r.date, r.amount) for r in res.rows] == [
        (date(2026, 8, 27), Decimal("-17.37")),
        (date(2026, 8, 28), Decimal("1250.00")),
        (date(2026, 9, 5), Decimal("-363.35")),
    ]
    # Détail marchand gardé, bruit (date, n° de carte, pays, montant) retiré ;
    # la section « poste annexe » (livret) n'est pas mélangée au compte courant.
    assert res.rows[0].label == "Carte boulangerie du parc"
    assert res.rows[1].label == "Virement SEPA reçu acme sas salaire"


def test_wrong_closing_is_not_verified():
    res = parse_pdf_columns(_bred_like(closing="999,99"))
    assert len(res.rows) == 3 and res.verified is False
