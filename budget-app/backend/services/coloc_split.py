"""Calcul de la répartition coloc avec algo min-cash-flow.

Pour chaque compte joint, on rassemble :
  - les charges partagées (split_mode ≠ PERSO) actives sur le mois
  - les splits persistés par charge (qui doit combien à qui)
  - les splits déjà settled (= remboursés) sont exclus du calcul

Puis on calcule "qui doit quoi à qui" via simplification min-cash-flow.
"""
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path

from sqlalchemy.orm import Session

from models import Account, Charge, ChargeSplit, SplitMode, User
from services.access import accessible_account_ids, is_joint_account
from services.budget_calc import charge_is_active_in_month


def _r2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass
class ColocChargeLine:
    charge_id: int
    label: str
    total: Decimal
    per_person: dict[int, Decimal]
    split_mode: str
    payer_user_id: int


@dataclass
class ColocSummary:
    year: int
    month: int
    user_id: int
    user_name: str
    total_due: Decimal           # ce que l'user doit en cumulé ce mois (splits non-settled)
    total_paid: Decimal          # ce que l'user a payé (charges dont il est payeur)
    balance: Decimal             # paid - due ; > 0 = créditeur, < 0 = débiteur
    by_charge: list[ColocChargeLine]


def compute_coloc_breakdown(db: Session, year: int, month: int) -> dict:
    """Répartition complète pour un mois. Considère tous les comptes joints
    visibles (avec au moins 1 AccountMember) et leurs charges partagées.

    Retourne :
      - charges_lines : ventilation détaillée par charge
      - summaries     : pour chaque coloc, dû / payé / solde + détail charges
      - debts         : liste minimale de virements pour solder (min-cash-flow)
    """
    # 1. Identifier les comptes joints concernés
    joint_account_ids = [
        a.id for a in db.query(Account).all() if is_joint_account(db, a.id)
    ]
    if not joint_account_ids:
        return {"charges_lines": [], "summaries": [], "debts": []}

    # 2. Charges partagées actives ce mois
    shared_charges = db.query(Charge).filter(
        Charge.is_active.is_(True),
        Charge.split_mode != SplitMode.PERSO,
        Charge.account_id.in_(joint_account_ids),
    ).all()
    shared_charges = [c for c in shared_charges if charge_is_active_in_month(c, month)]

    # 3. Lignes détaillées
    charges_lines: list[ColocChargeLine] = []
    involved_user_ids: set[int] = set()
    for ch in shared_charges:
        splits = db.query(ChargeSplit).filter(ChargeSplit.charge_id == ch.id).all()
        per_person: dict[int, Decimal] = {s.user_id: Decimal(s.amount or 0) for s in splits}
        involved_user_ids.update(per_person.keys())
        involved_user_ids.add(ch.user_id)
        charges_lines.append(ColocChargeLine(
            charge_id=ch.id,
            label=ch.label,
            total=Decimal(ch.total_amount or 0),
            per_person=per_person,
            split_mode=ch.split_mode.value if hasattr(ch.split_mode, "value") else str(ch.split_mode),
            payer_user_id=ch.user_id,
        ))

    if not involved_user_ids:
        return {"charges_lines": [], "summaries": [], "debts": []}

    # 4. Récupérer les noms d'affichage
    users = {u.id: u for u in db.query(User).filter(User.id.in_(involved_user_ids)).all()}

    # 5. Calcul dû / payé par user
    due: dict[int, Decimal] = {uid: Decimal(0) for uid in involved_user_ids}
    paid: dict[int, Decimal] = {uid: Decimal(0) for uid in involved_user_ids}
    by_charge_per_user: dict[int, list[ColocChargeLine]] = {uid: [] for uid in involved_user_ids}

    # On considère qu'une charge a été "payée" par le payeur pour le montant total.
    # On ignore les splits déjà settled dans le "dû" (car remboursés).
    for ch in shared_charges:
        paid[ch.user_id] = paid.get(ch.user_id, Decimal(0)) + Decimal(ch.total_amount or 0)
        splits = db.query(ChargeSplit).filter(ChargeSplit.charge_id == ch.id).all()
        for s in splits:
            if s.settled_at is not None:
                continue
            due[s.user_id] = due.get(s.user_id, Decimal(0)) + Decimal(s.amount or 0)

        line = next((l for l in charges_lines if l.charge_id == ch.id), None)
        if line:
            for uid in involved_user_ids:
                if uid in line.per_person:
                    by_charge_per_user[uid].append(line)

    summaries: list[ColocSummary] = []
    for uid in sorted(involved_user_ids):
        u = users.get(uid)
        name = (u.display_name or u.ha_username) if u else f"User #{uid}"
        d = _r2(due.get(uid, Decimal(0)))
        p = _r2(paid.get(uid, Decimal(0)))
        summaries.append(ColocSummary(
            year=year, month=month,
            user_id=uid, user_name=name,
            total_due=d, total_paid=p, balance=_r2(p - d),
            by_charge=by_charge_per_user.get(uid, []),
        ))

    # 6. Min-cash-flow : simplification des dettes
    debts = _min_cash_flow(summaries, users)

    return {
        "charges_lines": charges_lines,
        "summaries": summaries,
        "debts": debts,
    }


def _min_cash_flow(summaries: list[ColocSummary], users: dict[int, User]) -> list[dict]:
    """Settle the largest debtor with the largest creditor itérativement.
    O(n²) mais n ≤ une poignée de colocs. Retourne au plus n-1 transferts.
    """
    balances = [{"user_id": s.user_id, "name": s.user_name, "bal": s.balance} for s in summaries]
    debts: list[dict] = []
    eps = Decimal("0.01")

    while True:
        max_c = max(balances, key=lambda b: b["bal"])
        max_d = min(balances, key=lambda b: b["bal"])
        if max_c["bal"] < eps or max_d["bal"] > -eps:
            break
        amount = _r2(min(max_c["bal"], -max_d["bal"]))
        debts.append({
            "from_user_id": max_d["user_id"],
            "from_user_name": max_d["name"],
            "to_user_id": max_c["user_id"],
            "to_user_name": max_c["name"],
            "amount": amount,
        })
        max_c["bal"] = _r2(max_c["bal"] - amount)
        max_d["bal"] = _r2(max_d["bal"] + amount)

    return debts


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
    elements.append(Paragraph(
        f"Résumé Colocation — {months_fr[summary.month-1]} {summary.year}",
        title_style,
    ))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph(f"Pour : <b>{summary.user_name}</b>", styles['Heading2']))
    elements.append(Spacer(1, 0.5*cm))

    data = [["Charge", "Mode", "Total", "Ma part"]]
    for line in summary.by_charge:
        my_part = line.per_person.get(summary.user_id, Decimal(0))
        data.append([line.label, line.split_mode, f"{line.total:.2f} €", f"{my_part:.2f} €"])
    data.append(["", "", "TOTAL DÛ", f"{summary.total_due:.2f} €"])
    data.append(["", "", "TOTAL PAYÉ", f"{summary.total_paid:.2f} €"])
    sign = "+" if summary.balance >= 0 else ""
    data.append(["", "", "SOLDE", f"{sign}{summary.balance:.2f} €"])

    table = Table(data, colWidths=[6*cm, 3*cm, 3*cm, 3*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor("#1F4E79")),
        ('TEXTCOLOR', (0, 0), (-1, 0), HexColor("#FFFFFF")),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, -3), (-1, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (0, -3), (-1, -1), HexColor("#D9E1F2")),
        ('ALIGN', (2, 0), (3, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor("#BFBFBF")),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)

    doc.build(elements)
    return output_path
