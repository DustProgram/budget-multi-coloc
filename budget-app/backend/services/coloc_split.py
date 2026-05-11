"""
Calcul de la répartition coloc + génération des résumés par coloc.
"""
from dataclasses import dataclass
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import List, Optional

from sqlalchemy.orm import Session

from models import Charge, User, SplitMode
from services.budget_calc import compute_my_share, charge_is_active_in_month


@dataclass
class ColocChargeLine:
    charge_id: int
    label: str
    total: Decimal
    per_person: dict[int, Decimal]  # user_id -> montant
    split_mode: str
    payer_user_id: int  # qui a saisi la charge (= payeur supposé)


@dataclass
class ColocSummary:
    year: int
    month: int
    user_id: int
    user_name: str
    total_due: Decimal
    by_charge: list[ColocChargeLine]
    owes_to: dict[int, Decimal]  # user_id payeur -> montant dû


def compute_coloc_breakdown(db: Session, year: int, month: int) -> dict:
    """
    Calcule la répartition complète des charges partagées entre colocs pour le mois.

    Retourne :
      - charges_lines : liste des charges avec ventilation par coloc
      - per_user_summary : pour chaque coloc, ce qu'il doit globalement
      - debts : qui doit quoi à qui (sous forme de transferts)
    """
    # Récupérer tous les utilisateurs coloc
    colocs = db.query(User).filter(User.is_coloc.is_(True)).all()
    coloc_ids = [u.id for u in colocs]

    if not colocs:
        return {"charges_lines": [], "summaries": [], "debts": []}

    # Charges partagées (is_shared=True OU mode != Perso)
    shared_charges = db.query(Charge).filter(
        Charge.is_active.is_(True),
        Charge.split_mode != SplitMode.PERSO,
    ).all()

    charges_lines = []
    for ch in shared_charges:
        if not charge_is_active_in_month(ch, month):
            continue

        # Calculer la part par coloc selon le mode
        per_person: dict[int, Decimal] = {}
        if ch.split_mode == SplitMode.EGAL:
            num = ch.num_colocs or len(colocs)
            share = ch.total_amount / num if num > 0 else ch.total_amount
            # Répartir équitablement entre TOUS les colocs (limité au nb_colocs)
            for u in colocs[:num]:
                per_person[u.id] = share
        elif ch.split_mode == SplitMode.POURCENTAGE:
            # Le payeur paie X%, le reste est divisé entre les autres
            payer_share = ch.total_amount * (ch.split_value or Decimal(0)) / Decimal(100)
            others = [u for u in colocs if u.id != ch.user_id]
            if others:
                other_share = (ch.total_amount - payer_share) / len(others)
                per_person[ch.user_id] = payer_share
                for u in others:
                    per_person[u.id] = other_share
            else:
                per_person[ch.user_id] = ch.total_amount
        elif ch.split_mode == SplitMode.MONTANT_FIXE:
            # Le payeur paie le montant fixe, le reste est divisé
            payer_share = ch.split_value or Decimal(0)
            remaining = ch.total_amount - payer_share
            others = [u for u in colocs if u.id != ch.user_id]
            if others and remaining > 0:
                other_share = remaining / len(others)
                per_person[ch.user_id] = payer_share
                for u in others:
                    per_person[u.id] = other_share
            else:
                per_person[ch.user_id] = ch.total_amount

        charges_lines.append(ColocChargeLine(
            charge_id=ch.id,
            label=ch.label,
            total=ch.total_amount,
            per_person=per_person,
            split_mode=ch.split_mode.value,
            payer_user_id=ch.user_id,
        ))

    # Résumés par coloc
    summaries = []
    for coloc in colocs:
        total_due = Decimal(0)
        owes_to: dict[int, Decimal] = {}
        my_lines = []

        for line in charges_lines:
            my_share = line.per_person.get(coloc.id, Decimal(0))
            if my_share > 0:
                total_due += my_share
                my_lines.append(line)

                # Si je ne suis pas le payeur, je lui dois cette somme
                if line.payer_user_id != coloc.id:
                    owes_to[line.payer_user_id] = owes_to.get(line.payer_user_id, Decimal(0)) + my_share

        summaries.append(ColocSummary(
            year=year,
            month=month,
            user_id=coloc.id,
            user_name=coloc.display_name or coloc.ha_username,
            total_due=total_due,
            by_charge=my_lines,
            owes_to=owes_to,
        ))

    # Calcul des dettes nettes (qui doit combien à qui)
    debts = []
    for s in summaries:
        for payer_id, amount in s.owes_to.items():
            payer = next((u for u in colocs if u.id == payer_id), None)
            if payer:
                debts.append({
                    "from_user_id": s.user_id,
                    "from_user_name": s.user_name,
                    "to_user_id": payer_id,
                    "to_user_name": payer.display_name or payer.ha_username,
                    "amount": amount,
                })

    return {
        "charges_lines": charges_lines,
        "summaries": summaries,
        "debts": debts,
    }


def generate_coloc_pdf(summary: ColocSummary, output_path: Path) -> Path:
    """Génère un PDF récapitulatif pour un coloc."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    doc = SimpleDocTemplate(str(output_path), pagesize=A4,
                            topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    elements = []

    months_fr = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                 "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

    title_style = ParagraphStyle('Title', parent=styles['Title'],
                                  fontSize=18, textColor=HexColor("#1F4E79"))
    elements.append(Paragraph(f"Résumé Colocation - {months_fr[summary.month-1]} {summary.year}", title_style))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph(f"Pour : <b>{summary.user_name}</b>", styles['Heading2']))
    elements.append(Spacer(1, 0.5*cm))

    # Détail des charges
    data = [["Charge", "Mode", "Total", "Ma part"]]
    for line in summary.by_charge:
        my_part = line.per_person.get(summary.user_id, Decimal(0))
        data.append([line.label, line.split_mode, f"{line.total:.2f} €", f"{my_part:.2f} €"])

    data.append(["", "", "TOTAL", f"{summary.total_due:.2f} €"])

    table = Table(data, colWidths=[6*cm, 3*cm, 3*cm, 3*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor("#1F4E79")),
        ('TEXTCOLOR', (0, 0), (-1, 0), HexColor("#FFFFFF")),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (0, -1), (-1, -1), HexColor("#D9E1F2")),
        ('ALIGN', (2, 0), (3, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor("#BFBFBF")),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 0.8*cm))

    # Dettes
    if summary.owes_to:
        elements.append(Paragraph("À régler :", styles['Heading3']))
        debts_data = [["Bénéficiaire", "Montant"]]
        for payer_id, amount in summary.owes_to.items():
            debts_data.append([f"Coloc #{payer_id}", f"{amount:.2f} €"])

        debts_table = Table(debts_data, colWidths=[9*cm, 3*cm])
        debts_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor("#C00000")),
            ('TEXTCOLOR', (0, 0), (-1, 0), HexColor("#FFFFFF")),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor("#BFBFBF")),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(debts_table)

    doc.build(elements)
    return output_path
