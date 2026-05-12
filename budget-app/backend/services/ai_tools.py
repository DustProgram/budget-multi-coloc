"""Outils exposés à Claude via function calling.

Chaque outil a un schéma JSON (envoyé à Claude) et un handler qui exécute
l'action côté backend. Les handlers retournent le résultat sous forme de
dict JSON-sérialisable que Claude verra comme `tool_result`.

Convention :
  - Outils en lecture seule : préfixe `list_` ou `get_`
  - Outils d'écriture : préfixe `add_`, `mark_`, `delete_`. Si le montant
    impliqué est >= CONFIRMATION_THRESHOLD, l'outil renvoie un résultat
    `{"status": "pending_confirmation", "action_id": ...}` au lieu d'exécuter.
"""
from datetime import date as DateType, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from sqlalchemy.orm import Session

from models import (
    Account, Charge, Income, Purchase, ShoppingItem, User,
    Frequency, IncomeType, PaymentMethod, ShoppingPriority, SplitMode,
)
from services.access import accessible_account_ids, user_can_write_account
from services.budget_calc import compute_monthly_budget


CONFIRMATION_THRESHOLD = Decimal("50")


def _safe_decimal(value: Any, field: str) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"Champ '{field}' invalide ({value!r})")


def _parse_iso_date(value: Any, field: str) -> DateType:
    if isinstance(value, DateType):
        return value
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ValueError(f"Champ '{field}' doit être une date ISO YYYY-MM-DD")


# ============================================================
# Définitions Claude (schémas JSON envoyés à l'API)
# ============================================================

TOOL_DEFINITIONS = [
    {
        "name": "list_accounts",
        "description": "Liste tous les comptes bancaires visibles par l'utilisateur (propres + comptes joints).",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_dashboard",
        "description": (
            "Renvoie le budget agrégé du mois : revenus, charges, épargne, achats imputés, "
            "soldes par compte. Par défaut, mois courant."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "year": {"type": "integer", "description": "Année (par défaut année courante)"},
                "month": {"type": "integer", "description": "Mois 1-12 (par défaut mois courant)"},
            },
        },
    },
    {
        "name": "list_charges",
        "description": "Liste toutes les charges (perso et coloc) sur les comptes visibles.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_incomes",
        "description": "Liste tous les revenus sur les comptes visibles.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_shopping_items",
        "description": "Liste la liste de courses partagée (todo et faits récents).",
        "input_schema": {
            "type": "object",
            "properties": {
                "include_bought": {"type": "boolean", "description": "Inclure les items déjà achetés"},
            },
        },
    },
    {
        "name": "add_purchase",
        "description": (
            "Crée un achat ponctuel (carte, espèces, étalement). Si total_amount >= 50€, "
            "l'action sera mise en attente de confirmation utilisateur."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "description": {"type": "string"},
                "total_amount": {"type": "number"},
                "date": {"type": "string", "description": "Date ISO YYYY-MM-DD"},
                "account_id": {"type": "integer", "description": "ID du compte (cf. list_accounts)"},
                "category": {"type": "string"},
                "payment_method": {"type": "string", "enum": ["CB", "Virement", "Espèces", "Chèque", "Prélèvement", "Autre"]},
                "nb_installments": {"type": "integer", "description": "1 = comptant, 3 = 3× sans frais, etc."},
            },
            "required": ["description", "total_amount", "date", "account_id"],
        },
    },
    {
        "name": "add_charge",
        "description": (
            "Crée une charge récurrente (loyer, abonnement, etc.). Si total_amount >= 50€, "
            "demande confirmation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string"},
                "total_amount": {"type": "number"},
                "day_of_month": {"type": "integer", "minimum": 1, "maximum": 31},
                "account_id": {"type": "integer"},
                "frequency": {"type": "string", "enum": ["Mensuelle", "Bimensuelle", "Trimestrielle", "Semestrielle", "Annuelle"]},
                "split_mode": {"type": "string", "enum": ["Perso", "Égal", "Pourcentage", "Montant fixe"]},
                "num_colocs": {"type": "integer"},
                "valid_from": {"type": "string", "description": "Date ISO début (optionnel)"},
                "valid_to": {"type": "string", "description": "Date ISO fin (optionnel)"},
            },
            "required": ["label", "total_amount", "day_of_month", "account_id"],
        },
    },
    {
        "name": "add_income",
        "description": (
            "Crée un revenu récurrent (salaire, APL, etc.). Toute création de revenu "
            "demande confirmation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "source": {"type": "string"},
                "amount": {"type": "number"},
                "day_of_month": {"type": "integer", "minimum": 1, "maximum": 31},
                "account_id": {"type": "integer"},
                "type": {"type": "string", "enum": ["Régulier", "Ponctuel", "Variable"]},
                "valid_from": {"type": "string"},
                "valid_to": {"type": "string"},
            },
            "required": ["source", "amount", "day_of_month", "account_id"],
        },
    },
    {
        "name": "add_shopping_item",
        "description": "Ajoute un article à la liste de courses partagée.",
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string"},
                "quantity": {"type": "string", "description": "Ex: '2 kg', '1 bouteille'"},
                "category": {"type": "string"},
                "priority": {"type": "string", "enum": ["low", "normal", "high", "urgent"]},
                "estimated_price": {"type": "number"},
                "notes": {"type": "string"},
            },
            "required": ["label"],
        },
    },
    {
        "name": "mark_shopping_bought",
        "description": "Marque un article de la liste de courses comme acheté.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_id": {"type": "integer"},
                "actual_price": {"type": "number"},
            },
            "required": ["item_id"],
        },
    },
    {
        "name": "delete_shopping_item",
        "description": "Supprime définitivement un article de la liste de courses.",
        "input_schema": {
            "type": "object",
            "properties": {"item_id": {"type": "integer"}},
            "required": ["item_id"],
        },
    },
]


# ============================================================
# Handlers
# ============================================================

def _list_accounts(db: Session, user: User, _: dict) -> dict:
    ids = accessible_account_ids(db, user.id)
    accs = db.query(Account).filter(Account.id.in_(ids)).all() if ids else []
    return {
        "accounts": [
            {
                "id": a.id, "name": a.name, "bank": a.bank,
                "type": a.type.value if hasattr(a.type, "value") else str(a.type),
                "initial_balance": str(a.initial_balance),
                "space": a.space,
            }
            for a in accs
        ],
    }


def _get_dashboard(db: Session, user: User, args: dict) -> dict:
    today = DateType.today()
    year = int(args.get("year", today.year))
    month = int(args.get("month", today.month))
    snapshot = compute_monthly_budget(db, user.id, year, month)
    return {
        "year": year,
        "month": month,
        "total_incomes": str(snapshot.total_incomes),
        "total_charges": str(snapshot.total_charges),
        "total_savings": str(snapshot.total_savings),
        "total_purchases_imputed": str(snapshot.total_purchases_imputed),
        "total_initial_balance": str(snapshot.total_initial_balance),
        "total_final_balance": str(snapshot.total_final_balance),
        "available_for_purchases": str(snapshot.available_for_purchases),
        "accounts": [
            {
                "account_id": a.account_id, "account_name": a.account_name,
                "initial_balance": str(a.initial_balance),
                "final_balance": str(a.final_balance),
            }
            for a in snapshot.accounts
        ],
    }


def _list_charges(db: Session, user: User, _: dict) -> dict:
    ids = accessible_account_ids(db, user.id)
    if not ids:
        return {"charges": []}
    charges = (
        db.query(Charge)
        .filter(Charge.account_id.in_(ids), Charge.is_active.is_(True))
        .all()
    )
    return {
        "charges": [
            {
                "id": c.id, "label": c.label,
                "total_amount": str(c.total_amount),
                "day_of_month": c.day_of_month,
                "frequency": c.frequency.value if hasattr(c.frequency, "value") else str(c.frequency),
                "split_mode": c.split_mode.value if hasattr(c.split_mode, "value") else str(c.split_mode),
                "account_id": c.account_id,
            }
            for c in charges
        ],
    }


def _list_incomes(db: Session, user: User, _: dict) -> dict:
    ids = accessible_account_ids(db, user.id)
    if not ids:
        return {"incomes": []}
    incomes = (
        db.query(Income)
        .filter(Income.account_id.in_(ids), Income.is_active.is_(True))
        .all()
    )
    return {
        "incomes": [
            {
                "id": i.id, "source": i.source,
                "amount": str(i.amount),
                "day_of_month": i.day_of_month,
                "type": i.type.value if hasattr(i.type, "value") else str(i.type),
                "account_id": i.account_id,
            }
            for i in incomes
        ],
    }


def _list_shopping_items(db: Session, _user: User, args: dict) -> dict:
    include_bought = bool(args.get("include_bought", False))
    q = db.query(ShoppingItem)
    if not include_bought:
        q = q.filter(ShoppingItem.is_bought.is_(False))
    items = q.order_by(ShoppingItem.priority, ShoppingItem.created_at.desc()).limit(100).all()
    return {
        "items": [
            {
                "id": it.id, "label": it.label,
                "quantity": it.quantity, "category": it.category,
                "priority": it.priority.value if hasattr(it.priority, "value") else str(it.priority),
                "is_bought": it.is_bought,
                "estimated_price": str(it.estimated_price) if it.estimated_price is not None else None,
                "actual_price": str(it.actual_price) if it.actual_price is not None else None,
            }
            for it in items
        ],
    }


def _add_purchase(db: Session, user: User, args: dict) -> dict:
    description = str(args["description"]).strip()
    if not description:
        raise ValueError("description vide")
    total = _safe_decimal(args["total_amount"], "total_amount")
    pdate = _parse_iso_date(args["date"], "date")
    account_id = int(args["account_id"])
    if not user_can_write_account(db, user.id, account_id):
        raise ValueError(f"Pas le droit d'écrire sur le compte {account_id}")
    nb = int(args.get("nb_installments", 1))
    method_value = str(args.get("payment_method", "CB"))
    try:
        method = PaymentMethod(method_value)
    except ValueError:
        method = PaymentMethod.CB
    p = Purchase(
        description=description,
        total_amount=total,
        nb_installments=max(1, nb),
        date=pdate,
        category=args.get("category"),
        payment_method=method,
        account_id=account_id,
        user_id=user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {
        "status": "created",
        "purchase": {"id": p.id, "description": p.description, "total_amount": str(p.total_amount)},
        "entity_type": "purchase",
        "entity_id": p.id,
    }


def _add_charge(db: Session, user: User, args: dict) -> dict:
    label = str(args["label"]).strip()
    total = _safe_decimal(args["total_amount"], "total_amount")
    account_id = int(args["account_id"])
    if not user_can_write_account(db, user.id, account_id):
        raise ValueError(f"Pas le droit d'écrire sur le compte {account_id}")
    freq_value = str(args.get("frequency", "Mensuelle"))
    try:
        frequency = Frequency(freq_value)
    except ValueError:
        frequency = Frequency.MENSUELLE
    split_value = str(args.get("split_mode", "Perso"))
    try:
        split_mode = SplitMode(split_value)
    except ValueError:
        split_mode = SplitMode.PERSO
    c = Charge(
        label=label,
        total_amount=total,
        day_of_month=int(args["day_of_month"]),
        frequency=frequency,
        split_mode=split_mode,
        num_colocs=int(args.get("num_colocs", 1)),
        account_id=account_id,
        user_id=user.id,
        valid_from=_parse_iso_date(args["valid_from"], "valid_from") if args.get("valid_from") else None,
        valid_to=_parse_iso_date(args["valid_to"], "valid_to") if args.get("valid_to") else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {
        "status": "created",
        "charge": {"id": c.id, "label": c.label, "total_amount": str(c.total_amount)},
        "entity_type": "charge",
        "entity_id": c.id,
    }


def _add_income(db: Session, user: User, args: dict) -> dict:
    source = str(args["source"]).strip()
    amount = _safe_decimal(args["amount"], "amount")
    account_id = int(args["account_id"])
    if not user_can_write_account(db, user.id, account_id):
        raise ValueError(f"Pas le droit d'écrire sur le compte {account_id}")
    type_value = str(args.get("type", "Régulier"))
    try:
        income_type = IncomeType(type_value)
    except ValueError:
        income_type = IncomeType.REGULIER
    i = Income(
        source=source,
        amount=amount,
        day_of_month=int(args["day_of_month"]),
        type=income_type,
        account_id=account_id,
        user_id=user.id,
        is_active=True,
        valid_from=_parse_iso_date(args["valid_from"], "valid_from") if args.get("valid_from") else None,
        valid_to=_parse_iso_date(args["valid_to"], "valid_to") if args.get("valid_to") else None,
    )
    db.add(i)
    db.commit()
    db.refresh(i)
    return {
        "status": "created",
        "income": {"id": i.id, "source": i.source, "amount": str(i.amount)},
        "entity_type": "income",
        "entity_id": i.id,
    }


def _add_shopping_item(db: Session, user: User, args: dict) -> dict:
    label = str(args["label"]).strip()
    if not label:
        raise ValueError("label vide")
    prio_value = str(args.get("priority", "normal"))
    try:
        priority = ShoppingPriority(prio_value)
    except ValueError:
        priority = ShoppingPriority.NORMAL
    it = ShoppingItem(
        label=label,
        quantity=args.get("quantity"),
        category=args.get("category"),
        priority=priority,
        estimated_price=_safe_decimal(args["estimated_price"], "estimated_price") if args.get("estimated_price") is not None else None,
        notes=args.get("notes"),
        added_by_user_id=user.id,
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return {
        "status": "created",
        "item": {"id": it.id, "label": it.label},
        "entity_type": "shopping_item",
        "entity_id": it.id,
    }


def _mark_shopping_bought(db: Session, user: User, args: dict) -> dict:
    item_id = int(args["item_id"])
    it = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not it:
        raise ValueError(f"Article #{item_id} introuvable")
    it.is_bought = True
    it.bought_at = datetime.utcnow()
    it.bought_by_user_id = user.id
    if args.get("actual_price") is not None:
        it.actual_price = _safe_decimal(args["actual_price"], "actual_price")
    db.commit()
    return {
        "status": "marked_bought",
        "item": {"id": it.id, "label": it.label},
        "entity_type": "shopping_item",
        "entity_id": it.id,
    }


def _delete_shopping_item(db: Session, _user: User, args: dict) -> dict:
    item_id = int(args["item_id"])
    it = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not it:
        raise ValueError(f"Article #{item_id} introuvable")
    label = it.label
    db.delete(it)
    db.commit()
    return {"status": "deleted", "item": {"id": item_id, "label": label}}


HANDLERS = {
    "list_accounts": _list_accounts,
    "get_dashboard": _get_dashboard,
    "list_charges": _list_charges,
    "list_incomes": _list_incomes,
    "list_shopping_items": _list_shopping_items,
    "add_purchase": _add_purchase,
    "add_charge": _add_charge,
    "add_income": _add_income,
    "add_shopping_item": _add_shopping_item,
    "mark_shopping_bought": _mark_shopping_bought,
    "delete_shopping_item": _delete_shopping_item,
}

# Outils qui demandent confirmation utilisateur :
#   - dès qu'un montant >= 50€ est en jeu pour les écritures monétaires
#   - toujours pour add_income (changement de revenu impactant)
THRESHOLD_TOOLS = {"add_purchase": "total_amount", "add_charge": "total_amount"}
ALWAYS_CONFIRM = {"add_income"}


def requires_confirmation(tool_name: str, tool_input: dict) -> bool:
    if tool_name in ALWAYS_CONFIRM:
        return True
    field = THRESHOLD_TOOLS.get(tool_name)
    if not field:
        return False
    try:
        amount = _safe_decimal(tool_input.get(field, 0), field)
    except ValueError:
        return False
    return amount >= CONFIRMATION_THRESHOLD


def get_entity_info_for_pending(tool_name: str, tool_input: dict) -> dict:
    """Pour les actions en attente : préviewer ce qui serait créé."""
    return {"tool": tool_name, "input": tool_input}


def execute_tool(
    db: Session,
    user: User,
    tool_name: str,
    tool_input: dict,
) -> dict:
    handler = HANDLERS.get(tool_name)
    if not handler:
        raise ValueError(f"Outil inconnu : {tool_name}")
    return handler(db, user, tool_input)


def undo_action(db: Session, user: User, action) -> bool:
    """Annule une action déjà exécutée (supprime l'entité créée). Retourne True
    si succès. Ne s'applique qu'aux actions de création.
    """
    if not action.entity_type or not action.entity_id:
        return False
    model_map = {
        "purchase": Purchase,
        "charge": Charge,
        "income": Income,
        "shopping_item": ShoppingItem,
    }
    Model = model_map.get(action.entity_type)
    if not Model:
        return False
    obj = db.query(Model).filter(Model.id == action.entity_id).first()
    if not obj:
        return False
    db.delete(obj)
    action.status = "undone"
    db.commit()
    return True
