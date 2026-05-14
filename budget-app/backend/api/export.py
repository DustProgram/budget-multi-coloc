"""API Export — CSV et PDF d'un mois pour usage externe (impôts, archivage).

CSV : toutes les transactions du mois en une feuille à plat.
PDF : synthèse 1 page avec totaux + breakdown par catégorie/compte.
"""
import csv
import io
import tempfile
from datetime import date as DateType
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from models import (
    Account, Charge, Income, OneTimeTransfer, Purchase, RecurringTransfer,
    AutoSaving, User,
)
from models.base import get_db
from services.budget_calc import (
    compute_monthly_budget, compute_my_share, charge_is_active_in_month,
    purchase_impute_amount,
)

router = APIRouter()


def _safe_day(year: int, month: int, day: int) -> DateType:
    from calendar import monthrange
    last = monthrange(year, month)[1]
    return DateType(year, month, min(day, last))


def _collect_rows(db: Session, user: User, year: int, month: int) -> list[dict]:
    """Aplatit tous les mouvements du mois en lignes pour CSV/PDF."""
    rows: list[dict] = []
    acc_by_id = {
        a.id: a for a in db.query(Account).filter(Account.user_id == user.id).all()
    }
    def _acc(i):
        a = acc_by_id.get(i)
        return a.name if a else "—"

    # Revenus
    for inc in db.query(Income).filter(
        Income.user_id == user.id, Income.is_active.is_(True),
    ).all():
        if inc.account_id is None:
            continue
        d = _safe_day(year, month, inc.day_of_month)
        rows.append({
            "date": d.isoformat(), "type": "Revenu",
            "label": inc.source, "amount": str(inc.amount),
            "account": _acc(inc.account_id), "category": inc.type.value if hasattr(inc.type, "value") else str(inc.type),
        })

    # Charges
    for ch in db.query(Charge).filter(
        Charge.user_id == user.id, Charge.is_active.is_(True),
    ).all():
        if not charge_is_active_in_month(ch, month, year):
            continue
        if ch.account_id is None:
            continue
        d = _safe_day(year, month, ch.day_of_month)
        share = compute_my_share(ch)
        rows.append({
            "date": d.isoformat(), "type": "Charge",
            "label": ch.label, "amount": f"-{share}",
            "account": _acc(ch.account_id),
            "category": ch.split_mode.value if hasattr(ch.split_mode, "value") else str(ch.split_mode),
        })

    # Virements récurrents
    for tr in db.query(RecurringTransfer).filter(
        RecurringTransfer.user_id == user.id,
        RecurringTransfer.is_active.is_(True),
    ).all():
        d = _safe_day(year, month, tr.day_of_month)
        rows.append({
            "date": d.isoformat(), "type": "Virement récurrent",
            "label": tr.label, "amount": str(tr.amount),
            "account": f"{_acc(tr.source_account_id)} → {_acc(tr.dest_account_id)}",
            "category": "",
        })

    # Virements ponctuels
    for tr in db.query(OneTimeTransfer).filter(
        OneTimeTransfer.user_id == user.id,
    ).all():
        if not (tr.date and tr.date.year == year and tr.date.month == month):
            continue
        rows.append({
            "date": tr.date.isoformat(), "type": "Virement ponctuel",
            "label": tr.label, "amount": str(tr.amount),
            "account": f"{_acc(tr.source_account_id)} → {_acc(tr.dest_account_id)}",
            "category": "",
        })

    # Épargne
    for sv in db.query(AutoSaving).filter(
        AutoSaving.user_id == user.id, AutoSaving.is_active.is_(True),
    ).all():
        d = _safe_day(year, month, sv.day_of_month)
        rows.append({
            "date": d.isoformat(), "type": "Épargne",
            "label": sv.label, "amount": str(sv.amount),
            "account": f"{_acc(sv.source_account_id)} → {_acc(sv.dest_account_id)}",
            "category": "",
        })

    # Achats
    for p in db.query(Purchase).filter(Purchase.user_id == user.id).all():
        amount = purchase_impute_amount(p, year, month)
        if amount == 0:
            continue
        # Date d'imputation = jour de l'achat ramené au mois courant
        d = _safe_day(year, month, p.date.day) if p.date else DateType(year, month, 1)
        rows.append({
            "date": d.isoformat(), "type": "Achat",
            "label": p.description, "amount": f"-{amount}",
            "account": _acc(p.account_id) if p.account_id else "—",
            "category": p.category or "",
        })

    rows.sort(key=lambda r: r["date"])
    return rows


@router.get("/csv")
async def export_csv(
    request: Request,
    db: Session = Depends(get_db),
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
):
    user: User = request.state.user
    rows = _collect_rows(db, user, year, month)

    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=["date", "type", "label", "amount", "account", "category"],
        delimiter=";",
    )
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    content = buf.getvalue().encode("utf-8-sig")  # BOM pour Excel FR
    filename = f"budget_{year}_{month:02d}.csv"
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/pdf")
async def export_pdf(
    request: Request,
    db: Session = Depends(get_db),
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
):
    """Export PDF synthèse — 1 page A4 avec totaux + breakdown."""
    user: User = request.state.user
    rows = _collect_rows(db, user, year, month)
    budget = compute_monthly_budget(db, user.id, year, month)

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )

    output = Path(tempfile.gettempdir()) / f"budget_{user.id}_{year}_{month:02d}.pdf"
    doc = SimpleDocTemplate(
        str(output), pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "title", parent=styles["Title"], fontSize=20, spaceAfter=14,
        textColor=HexColor("#B45309"),
    )
    body_style = styles["BodyText"]

    months_fr = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet',
                 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
    elements = [
        Paragraph(f"Budget — {months_fr[month - 1]} {year}", title_style),
        Paragraph(f"Utilisateur : {user.display_name or user.ha_username}", body_style),
        Spacer(1, 0.5 * cm),
    ]

    # Totaux
    totals_data = [
        ["Revenus", f"{budget.total_incomes} €"],
        ["Charges", f"{budget.total_charges} €"],
        ["Épargne", f"{budget.total_savings} €"],
        ["Achats imputés", f"{budget.total_purchases_imputed} €"],
        ["", ""],
        ["Solde initial", f"{budget.total_initial_balance} €"],
        ["Solde fin de mois", f"{budget.total_final_balance} €"],
        ["Marge dispo", f"{budget.available_for_purchases} €"],
    ]
    t = Table(totals_data, colWidths=[6 * cm, 6 * cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BACKGROUND", (0, -3), (-1, -1), HexColor("#FEF3C7")),
        ("FONTNAME", (0, -3), (-1, -1), "Helvetica-Bold"),
        ("LINEBELOW", (0, 0), (-1, 3), 0.3, HexColor("#D6D3D1")),
    ]))
    elements.extend([t, Spacer(1, 0.7 * cm)])

    # Détail des mouvements
    elements.append(Paragraph("<b>Détail des mouvements</b>", body_style))
    elements.append(Spacer(1, 0.2 * cm))
    detail_data = [["Date", "Type", "Libellé", "Compte", "Montant"]]
    for r in rows:
        detail_data.append([r["date"], r["type"], r["label"][:30], r["account"][:25], r["amount"] + " €"])
    if len(detail_data) == 1:
        detail_data.append(["—", "—", "Aucun mouvement", "—", "—"])
    dt = Table(detail_data, colWidths=[2.2 * cm, 3.2 * cm, 5.5 * cm, 4 * cm, 2.5 * cm], repeatRows=1)
    dt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#E7E5E4")),
        ("ALIGN", (4, 1), (4, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, HexColor("#A8A29E")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#FFFFFF"), HexColor("#FAFAF9")]),
    ]))
    elements.append(dt)

    doc.build(elements)
    return FileResponse(
        path=output, media_type="application/pdf",
        filename=f"budget_{year}_{month:02d}.pdf",
    )
