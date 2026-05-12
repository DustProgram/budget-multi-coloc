"""Gestion automatique des `ChargeSplit` pour les charges sur comptes joints.

Quand une charge est saisie sur un compte qui a des `AccountMember`, on crée
les splits selon le mode (Égal / Pourcentage / Montant fixe). En PERSO on
n'en crée pas — la charge reste à la charge unique du payeur.
"""
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from models import Charge, ChargeSplit, SplitMode
from services.access import account_member_user_ids, is_joint_account


def round2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def regenerate_splits(db: Session, charge: Charge) -> list[ChargeSplit]:
    """(Re)génère les ChargeSplit d'une charge selon son mode de partage.

    Idempotent : supprime les splits existants et les recrée. Ne crée RIEN si :
      - le compte n'a pas de membres (compte solo) → la charge est perso de facto
      - split_mode = PERSO
      - le mode est Pourcentage ou Montant fixe SANS split_value valide
    """
    # Toujours wipe — chaque appel reflète l'état courant des members + mode
    db.query(ChargeSplit).filter(ChargeSplit.charge_id == charge.id).delete()

    if charge.split_mode == SplitMode.PERSO:
        return []
    if not charge.account_id or not is_joint_account(db, charge.account_id):
        return []

    members = account_member_user_ids(db, charge.account_id)
    if not members:
        return []

    total = Decimal(charge.total_amount or 0)
    splits: list[ChargeSplit] = []

    if charge.split_mode == SplitMode.EGAL:
        per_person = round2(total / len(members))
        # Ajuster le dernier pour absorber l'arrondi (somme exacte = total)
        running = Decimal(0)
        for i, uid in enumerate(members):
            amount = per_person if i < len(members) - 1 else round2(total - running)
            splits.append(ChargeSplit(charge_id=charge.id, user_id=uid, amount=amount))
            running += amount

    elif charge.split_mode == SplitMode.POURCENTAGE:
        # Le payeur paie X% du total, le reste est divisé entre les autres
        pct = Decimal(charge.split_value or 0)
        payer_share = round2(total * pct / Decimal(100))
        others = [u for u in members if u != charge.user_id]
        if others:
            remaining = round2(total - payer_share)
            other_share = round2(remaining / len(others))
            running = payer_share
            splits.append(ChargeSplit(charge_id=charge.id, user_id=charge.user_id, amount=payer_share))
            for i, uid in enumerate(others):
                amount = other_share if i < len(others) - 1 else round2(total - running)
                splits.append(ChargeSplit(charge_id=charge.id, user_id=uid, amount=amount))
                running += amount
        else:
            splits.append(ChargeSplit(charge_id=charge.id, user_id=charge.user_id, amount=total))

    elif charge.split_mode == SplitMode.MONTANT_FIXE:
        # Le payeur paie un montant fixe, le reste est divisé entre les autres
        fixed = Decimal(charge.split_value or 0)
        others = [u for u in members if u != charge.user_id]
        remaining = round2(total - fixed)
        if others and remaining > 0:
            other_share = round2(remaining / len(others))
            running = fixed
            splits.append(ChargeSplit(charge_id=charge.id, user_id=charge.user_id, amount=fixed))
            for i, uid in enumerate(others):
                amount = other_share if i < len(others) - 1 else round2(total - running)
                splits.append(ChargeSplit(charge_id=charge.id, user_id=uid, amount=amount))
                running += amount
        else:
            splits.append(ChargeSplit(charge_id=charge.id, user_id=charge.user_id, amount=total))

    for s in splits:
        db.add(s)
    db.flush()
    return splits


def my_share_for_user(db: Session, charge: Charge, user_id: int) -> Decimal:
    """Part actuelle de l'user pour une charge. Priorité aux splits persistés,
    sinon retombe sur la logique historique de `services.budget_calc.compute_my_share`."""
    if not charge.account_id or not is_joint_account(db, charge.account_id):
        # Compte solo → l'utilisateur paie selon le mode "perso"
        from services.budget_calc import compute_my_share
        if charge.user_id == user_id:
            return compute_my_share(charge)
        return Decimal(0)

    split = db.query(ChargeSplit).filter(
        ChargeSplit.charge_id == charge.id,
        ChargeSplit.user_id == user_id,
    ).first()
    if split:
        return Decimal(split.amount or 0)
    return Decimal(0)
