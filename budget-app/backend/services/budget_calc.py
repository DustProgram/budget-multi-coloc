"""
Logique de calcul budgétaire - transposition exacte de l'Excel.

Ordre logique de calcul (validé sur l'Excel) :
  Solde initial → + Revenus → ± Virements → − Charges → − Épargne → − Achats = Solde fin
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models import (
    Account, Income, Charge, RecurringTransfer, OneTimeTransfer,
    AutoSaving, Purchase, User, Frequency, SplitMode,
)


@dataclass
class MonthlyAccountSummary:
    """Résumé d'un compte pour un mois donné."""
    account_id: int
    account_name: str
    bank: str
    initial_balance: Decimal = Decimal(0)
    incomes: Decimal = Decimal(0)
    transfers_net: Decimal = Decimal(0)  # + entrants - sortants
    charges: Decimal = Decimal(0)  # négatif
    savings: Decimal = Decimal(0)  # peut être + (compte destination) ou - (source)
    purchases: Decimal = Decimal(0)  # négatif
    final_balance: Decimal = Decimal(0)


@dataclass
class MonthlyBudget:
    """Synthèse mensuelle complète pour un utilisateur."""
    user_id: int
    year: int
    month: int

    total_incomes: Decimal = Decimal(0)
    total_charges: Decimal = Decimal(0)
    total_savings: Decimal = Decimal(0)
    total_purchases_imputed: Decimal = Decimal(0)
    total_initial_balance: Decimal = Decimal(0)
    total_final_balance: Decimal = Decimal(0)

    available_for_purchases: Decimal = Decimal(0)
    accounts: list[MonthlyAccountSummary] = field(default_factory=list)


# ============================================================
# Calculs primitifs
# ============================================================

def compute_my_share(charge: Charge) -> Decimal:
    """Calcule la part personnelle d'une charge selon le mode de partage."""
    if not charge.total_amount:
        return Decimal(0)

    if charge.split_mode == SplitMode.PERSO:
        return charge.total_amount

    if charge.split_mode == SplitMode.EGAL:
        if charge.num_colocs and charge.num_colocs > 0:
            return charge.total_amount / charge.num_colocs
        return charge.total_amount

    if charge.split_mode == SplitMode.POURCENTAGE:
        return charge.total_amount * (charge.split_value or Decimal(0)) / Decimal(100)

    if charge.split_mode == SplitMode.MONTANT_FIXE:
        return charge.split_value or Decimal(0)

    return charge.total_amount


def _in_validity_window(obj, year: int, month: int) -> bool:
    """Vérifie qu'un objet (charge/income/transfer/saving) avec champs
    optionnels valid_from / valid_to est actif sur le mois (year, month)."""
    vf = getattr(obj, "valid_from", None)
    vt = getattr(obj, "valid_to", None)
    # Mois cible : on prend le 1er jour
    from datetime import date as _date
    target_start = _date(year, month, 1)
    if month == 12:
        target_end = _date(year + 1, 1, 1)
    else:
        target_end = _date(year, month + 1, 1)
    if vf is not None and vf >= target_end:
        return False  # commence après le mois
    if vt is not None and vt < target_start:
        return False  # expiré avant le mois
    return True


def charge_is_active_in_month(charge: Charge, target_month: int, year: int = None) -> bool:
    """Détermine si une charge est imputée sur le mois cible."""
    if not charge.is_active:
        return False
    # Si l'appel ne fournit pas l'année (ancien code), on tolère mais on ne
    # peut pas vérifier la fenêtre valid_from/valid_to — on suppose actif.
    if year is not None and not _in_validity_window(charge, year, target_month):
        return False
    if charge.frequency == Frequency.MENSUELLE:
        return True
    return charge.month == target_month


def purchase_impute_amount(purchase: Purchase, year: int, month: int) -> Decimal:
    """Combien de cet achat est imputé sur le mois (year, month) ?"""
    if not purchase.date or not purchase.total_amount:
        return Decimal(0)

    # Différence en mois entre la date d'achat et le mois cible
    diff_months = (year - purchase.date.year) * 12 + (month - purchase.date.month)
    if diff_months < 0:
        return Decimal(0)

    max_diff = max((purchase.nb_installments or 1) - 1, 0)
    if diff_months > max_diff:
        return Decimal(0)

    return purchase.monthly_amount


# ============================================================
# Synthèse mensuelle par utilisateur
# ============================================================

def compute_monthly_budget(db: Session, user_id: int, year: int, month: int) -> MonthlyBudget:
    """
    Calcule le budget complet d'un utilisateur pour un mois donné.
    """
    budget = MonthlyBudget(user_id=user_id, year=year, month=month)

    # ===== 1. REVENUS =====
    incomes = db.query(Income).filter(
        Income.user_id == user_id,
        Income.is_active.is_(True),
    ).all()
    incomes = [i for i in incomes if _in_validity_window(i, year, month)]
    budget.total_incomes = sum((i.amount for i in incomes), Decimal(0))

    # ===== 2. CHARGES (ma part, mois actuel) =====
    charges = db.query(Charge).filter(
        Charge.user_id == user_id,
        Charge.is_active.is_(True),
    ).all()
    for charge in charges:
        if charge_is_active_in_month(charge, month, year):
            budget.total_charges += compute_my_share(charge)

    # ===== 3. ÉPARGNE AUTO =====
    savings = db.query(AutoSaving).filter(
        AutoSaving.user_id == user_id,
        AutoSaving.is_active.is_(True),
    ).all()
    savings = [s for s in savings if _in_validity_window(s, year, month)]
    budget.total_savings = sum((s.amount for s in savings), Decimal(0))

    # ===== 4. ACHATS (imputés sur le mois, mensualités gérées) =====
    purchases = db.query(Purchase).filter(Purchase.user_id == user_id).all()
    budget.total_purchases_imputed = sum(
        (purchase_impute_amount(p, year, month) for p in purchases),
        Decimal(0),
    )

    # ===== Solde disponible pour achats =====
    # Revenus - Charges - Épargne - Achats déjà saisis
    budget.available_for_purchases = (
        budget.total_incomes
        - budget.total_charges
        - budget.total_savings
        - budget.total_purchases_imputed
    )

    # ===== 5. Calcul par compte =====
    from services.access import is_joint_account
    from models import SplitMode

    accounts = db.query(Account).filter(
        Account.user_id == user_id,
        Account.is_active.is_(True),
    ).all()

    # Cache : un compte est-il joint (= au moins un AccountMember) ?
    _joint_cache: dict[int, bool] = {}
    def _is_joint(acc_id: int) -> bool:
        if acc_id not in _joint_cache:
            _joint_cache[acc_id] = is_joint_account(db, acc_id)
        return _joint_cache[acc_id]

    for acc in accounts:
        summary = MonthlyAccountSummary(
            account_id=acc.id,
            account_name=acc.name,
            bank=acc.bank,
            initial_balance=acc.initial_balance or Decimal(0),
        )

        # Revenus reçus sur ce compte
        for inc in incomes:
            if inc.account_id == acc.id:
                summary.incomes += inc.amount

        # Virements interbancaires (récurrents mensuels actifs + ponctuels du mois)
        rec_transfers = db.query(RecurringTransfer).filter(
            RecurringTransfer.user_id == user_id,
            RecurringTransfer.is_active.is_(True),
            RecurringTransfer.frequency == Frequency.MENSUELLE,
        ).all()
        for tr in rec_transfers:
            if not _in_validity_window(tr, year, month):
                continue
            if tr.dest_account_id == acc.id:
                summary.transfers_net += tr.amount
            if tr.source_account_id == acc.id:
                summary.transfers_net -= tr.amount

        ot_transfers = db.query(OneTimeTransfer).filter(
            OneTimeTransfer.user_id == user_id,
        ).all()
        for tr in ot_transfers:
            if tr.date and tr.date.year == year and tr.date.month == month:
                if tr.dest_account_id == acc.id:
                    summary.transfers_net += tr.amount
                if tr.source_account_id == acc.id:
                    summary.transfers_net -= tr.amount

        # Charges sur ce compte.
        # IMPORTANT — modèle abondement (0.9.0) : pour les charges partagées
        # sur un compte joint, on assume que les colocs abondent à temps. Le
        # total sort du joint, mais autant d'abondements (théoriques) rentrent
        # → net = 0. On NE soustrait donc PAS ces charges du solde projeté
        # du joint, pour ne pas afficher de découvert artificiel.
        # Le retard d'abondement reste visible sur la page Coloc et le
        # dashboard perso, sans pénaliser les vues mensuelle/annuelle.
        for charge in charges:
            if charge.account_id != acc.id:
                continue
            if not charge_is_active_in_month(charge, month, year):
                continue
            if charge.split_mode != SplitMode.PERSO and _is_joint(acc.id):
                continue  # neutralisée — abondements théoriques compensent
            summary.charges -= compute_my_share(charge)

        # Épargne (compte source = - , destination = +)
        for sv in savings:
            if sv.dest_account_id == acc.id:
                summary.savings += sv.amount
            if sv.source_account_id == acc.id:
                summary.savings -= sv.amount

        # Achats imputés
        for p in purchases:
            if p.account_id == acc.id:
                summary.purchases -= purchase_impute_amount(p, year, month)

        summary.final_balance = (
            summary.initial_balance
            + summary.incomes
            + summary.transfers_net
            + summary.charges
            + summary.savings
            + summary.purchases
        )

        budget.accounts.append(summary)
        budget.total_initial_balance += summary.initial_balance
        budget.total_final_balance += summary.final_balance

    return budget


# ============================================================
# Vue annuelle (12 mois)
# ============================================================

def compute_yearly_overview(db: Session, user_id: int, year: int) -> list[MonthlyBudget]:
    """Retourne 12 résumés mensuels (jan-déc) pour l'utilisateur."""
    return [compute_monthly_budget(db, user_id, year, m) for m in range(1, 13)]


# ============================================================
# Simulation d'achat
# ============================================================

@dataclass
class PurchaseSimulation:
    can_afford_global: bool
    can_afford_account: Optional[bool]  # None si pas de compte sélectionné
    available_before: Decimal
    available_after: Decimal
    account_balance_after: Optional[Decimal]
    final_balance_before: Decimal
    final_balance_after: Decimal
    verdict_message: str


def simulate_purchase(
    db: Session,
    user_id: int,
    amount: Decimal,
    account_id: Optional[int],
    year: int,
    month: int,
    alert_threshold: Decimal = Decimal(0),
) -> PurchaseSimulation:
    """Simule un achat avant validation."""
    budget = compute_monthly_budget(db, user_id, year, month)

    available_before = budget.available_for_purchases - alert_threshold
    available_after = available_before - amount
    final_balance_after = budget.total_final_balance - amount

    can_afford_global = available_after >= 0

    account_balance_after: Optional[Decimal] = None
    can_afford_account: Optional[bool] = None
    if account_id:
        acc_summary = next(
            (a for a in budget.accounts if a.account_id == account_id), None
        )
        if acc_summary:
            account_balance_after = acc_summary.final_balance - amount
            can_afford_account = account_balance_after >= 0

    if amount == 0:
        verdict = "⏳ Saisis un montant"
    elif can_afford_global and (can_afford_account or can_afford_account is None):
        verdict = "✅ Achat possible"
    elif can_afford_global and can_afford_account is False:
        verdict = "⚠️ Globalement OK mais compte insuffisant"
    else:
        verdict = "❌ Achat non recommandé"

    return PurchaseSimulation(
        can_afford_global=can_afford_global,
        can_afford_account=can_afford_account,
        available_before=available_before,
        available_after=available_after,
        account_balance_after=account_balance_after,
        final_balance_before=budget.total_final_balance,
        final_balance_after=final_balance_after,
        verdict_message=verdict,
    )
