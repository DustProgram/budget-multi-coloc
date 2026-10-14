"""Démarrage rapide : trier d'un coup les opérations « à valider ».

On regroupe par commerçant (libellé sans les mots génériques type CARTE,
PRLV, VIR…), puis on sépare par montant : un même montant qui revient sur
au moins 2 mois = charge ou revenu récurrent à déclarer ; le reste = achats
catégorisés (devinés par mots-clés) ou entrées ponctuelles à ignorer.
L'utilisateur valide ou corrige chaque groupe avant application.
"""
from __future__ import annotations

import hashlib
import json
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from statistics import median
from typing import Optional

from sqlalchemy.orm import Session

from models import Account, BankTransaction, User
from services import reconciliation as rec
from services.access import (
    account_member_user_ids, accessible_account_ids, is_joint_account, user_can_write_account,
)

from services.envelopes import threshold_for_account

logger = logging.getLogger(__name__)

GENERIC = {
    "CARTE", "CB", "PRLV", "PRELEVEMENT", "SEPA", "VIR", "VIREMENT", "INST", "INSTANTANE",
    "EMIS", "RECU", "AUTOMATIQUE", "FACTURE", "PAIEMENT", "ACHAT", "DE", "DU", "LA", "LE",
    "MR", "MME", "M", "SAS", "SARL", "SA", "ET", "CIE", "SCA", "EUROPE", "WWW", "COM", "FR",
    "ECHEANCE", "EN", "TROIS", "FOIS", "COTISATION", "ESPECE", "VERSEMENT",
    "VERS", "POUR", "IBAN", "AUTOMATIQUE", "PENDING",
}
# Prélèvements, virements programmés… : un montant qui revient = vraie charge.
SCHEDULED_PREFIXES = ("PRELEVEMENT", "PRLV", "VIREMENT AUTOMATIQUE", "COTISATION", "ECHEANCE")
# Un même montant chez ces commerces d'un mois sur l'autre est une coïncidence, pas un abonnement.
EVERYDAY = {"Restaurants", "Alimentation", "Transport", "Loisirs", "Vêtements"}
SAVING_HINTS = ("EPARGNE", "LIVRET", "FINARY", "PEA", "ASSURANCE VIE", "BTC", "CRYPTO")

# Premier mot-clé trouvé dans le libellé normalisé → catégorie (cf Settings.categories)
CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Restaurants", ("MCDONALD", "QUICK", "BURGER", "KFC", "UBER EATS", "EATS", "DELIVEROO", "RESTAU",
                     "SNACK", "PIZZ", "SUSHI", "KEBAB", "BRASSERIE", "CAFE", "BAR ", "BOULANG", "STARBUCKS")),
    ("Alimentation", ("CARREFOUR", "LECLERC", "AUCHAN", "LIDL", "ALDI", "MONOPRIX", "FRANPRIX", "INTERMARCHE",
                      "CASINO", "PICARD", "SUPER U", "HYPER U", "EPICERIE", "PRIMEUR", "MARCHE", "SPAR",
                      "NETTO", "GRAND FRAIS", "BIOCOOP", "NATURALIA", "LEADER PRICE")),
    ("Transport", ("SNCF", "RATP", "NAVIGO", "UBER", "BOLT", "HEETCH", "TOTAL", "ESSO", "SHELL", "BP ",
                   "AVIA", "PEAGE", "PARKING", "AIR ", "AIRLINE", "AIRWAYS", "CARAIBES", "EASYJET",
                   "BLABLACAR", "TAXI", "LIME", "DOTT")),
    ("Tech / Abonnements", ("APPLE", "GOOGLE", "NETFLIX", "SPOTIFY", "DEEZER", "AMAZON PRIME", "DISNEY",
                            "CANAL", "FREE MOBILE", "FREE TELECOM", "ORANGE", "SFR", "BOUYGUES", "SOSH",
                            "MICROSOFT", "OPENAI", "ANTHROPIC", "PLAYSTATION", "STEAM", "RIOT", "NINTENDO",
                            "TOOMICS", "YOUTUBE", "ADOBE")),
    ("Santé", ("PHARMA", "MEDECIN", "DOCTOLIB", "DENTISTE", "OPTIC", "LABO", "HOPITAL", "MUTUELLE")),
    ("Vêtements", ("ZARA", "H M", "KIABI", "PRIMARK", "UNIQLO", "NIKE", "ADIDAS", "JD SPORTS",
                   "CELIO", "JULES", "VINTED")),
    ("Maison", ("IKEA", "LEROY", "CASTORAMA", "BRICO", "CONFORAMA", "BUT ", "ACTION", "MAISONS DU MONDE",
                "BOULANGER", "DARTY")),
    ("Loisirs", ("CINEMA", "UGC", "PATHE", "GAUMONT", "FNAC SPECTACLES", "TICKETMASTER", "BOWLING",
                 "MUSEE", "CONCERT", "PLANETE", "JEV")),
    ("Sport", ("DECATHLON", "INTERSPORT", "GO SPORT", "BASIC FIT", "FITNESS", "SALLE DE SPORT", "ON AIR", "KEEP COOL", "NEONESS")),
    ("Voyages", ("BOOKING", "AIRBNB", "HOTEL", "DUFRY", "DUTY FREE", "EXPEDIA")),
]


def merchant_tokens(label: str) -> list[str]:
    toks = [t for t in rec.normalize_label(label).split() if t not in GENERIC and len(t) > 1]
    return list(dict.fromkeys(toks))


def merchant_key(label: str) -> str:
    return " ".join(merchant_tokens(label)[:3]) or rec.suggest_pattern(label)


def guess_category(label: str) -> Optional[str]:
    norm = " " + rec.normalize_label(label) + " "
    for cat, kws in CATEGORY_KEYWORDS:
        if any(kw in norm for kw in kws):
            return cat
    return None


@dataclass
class Group:
    kind: str                 # new_charge | new_income | new_purchase | ignore
    label: str
    pattern: str
    tx_ids: list[int]
    amount: Decimal           # montant typique (valeur absolue)
    day: int
    months: int
    total: Decimal
    category: Optional[str] = None
    reason: str = ""
    examples: list[str] = field(default_factory=list)
    contributor_user_id: Optional[int] = None
    contributor_name: Optional[str] = None

    @property
    def id(self) -> str:
        return hashlib.sha1(f"{self.kind}|{self.pattern}|{self.tx_ids[0]}".encode()).hexdigest()[:12]


def _clusters_by_amount(txs: list[BankTransaction]) -> list[list[BankTransaction]]:
    clusters: list[list[BankTransaction]] = []
    for t in sorted(txs, key=lambda t: abs(t.amount)):
        a = abs(Decimal(t.amount))
        if clusters:
            ref = abs(Decimal(clusters[-1][0].amount))
            if a - ref <= max(Decimal("2.00"), ref * Decimal("0.05")):
                clusters[-1].append(t)
                continue
        clusters.append([t])
    return clusters


def _months(txs) -> int:
    return len({(t.date.year, t.date.month) for t in txs})


def _own_names(user: User) -> list[set[str]]:
    """Nom affiché et identifiant, chacun devant apparaître en entier dans le libellé :
    « Léa Martin » ne doit pas passer pour « Paul Martin »."""
    names = [set(rec.normalize_label(n or "").split()) for n in (user.display_name, user.ha_username)]
    return [n for n in names if n]


def suggest_groups(db: Session, user: User, account_id: Optional[int] = None) -> list[Group]:
    ids = [i for i in accessible_account_ids(db, user.id) if user_can_write_account(db, user.id, i)]
    if account_id is not None:
        ids = [i for i in ids if i == account_id]
    txs = db.query(BankTransaction).filter(
        BankTransaction.account_id.in_(ids), BankTransaction.status == rec.TO_REVIEW,
    ).all()

    by_merchant: dict[tuple, list[BankTransaction]] = {}
    for t in txs:
        by_merchant.setdefault((t.account_id, t.amount < 0, merchant_key(t.label)), []).append(t)

    me = _own_names(user)
    members_by_account = {
        aid: _member_first_names(db, aid) for aid in {a for (a, _, _) in by_merchant} if is_joint_account(db, aid)
    }
    groups: list[Group] = []
    daily_by_account: dict[int, list[BankTransaction]] = defaultdict(list)
    thresholds: dict[int, Decimal] = {}
    for (account, is_debit, key), items in by_merchant.items():
        sample = rec.normalize_label(items[0].label)
        toks = set(merchant_tokens(items[0].label))
        if not is_debit and account in members_by_account:
            member = next(((uid, name) for first, uid, name in members_by_account[account] if first in toks), None)
            if member:
                g = _group("contribution", key, items, reason=f"Virement de {member[1]} sur le compte joint")
                g.contributor_user_id, g.contributor_name = member
                g.label = f"Abondement de {member[1]}"
                groups.append(g)
                continue
        is_transfer = sample.startswith(("VIR", "VIREMENT")) and not sample.startswith("VIREMENT AUTOMATIQUE")
        own = any(n <= toks for n in me)
        if is_transfer and own:
            groups.append(_group("ignore", key, items, reason="Virement entre tes comptes ?"))
            continue
        leftovers: list[BankTransaction] = []
        if not is_debit:
            # Un revenu (salaire, CAF…) varie souvent un peu : on regarde la régularité, pas le montant.
            if _months(items) >= 2 and len(items) <= 2 * _months(items):
                groups.append(_group("new_income", key, items, reason=f"Reçu chaque mois ({_months(items)} mois)"))
            else:
                groups.append(_group("ignore", key, items, reason="Entrée ponctuelle (remboursement, dépôt…)"))
            continue
        scheduled = sample.startswith(SCHEDULED_PREFIXES)
        category = guess_category(items[0].label)
        for cl in _clusters_by_amount(items):
            m = _months(cl)
            amount = abs(Decimal(cl[0].amount))
            # Carte : abonnement seulement si commerce « abonnement » connu, ou montant
            # inconnu ≥ 10 € une fois par mois (sinon le café du coin passe pour une charge).
            recurring = m >= 2 and len(cl) <= m + 1 if scheduled else (
                m >= 2 and len(cl) == m and (
                    category == "Tech / Abonnements" or (category is None and amount >= 10)
                )
            )
            if recurring:
                hint = any(h in sample for h in SAVING_HINTS)
                groups.append(_group(
                    "new_charge", key, cl,
                    reason="Épargne / placement programmé ?" if hint else f"Revient chaque mois ({m} mois)",
                ))
            else:
                leftovers.extend(cl)
        # Sous le seuil : vie quotidienne, sans détail. Au-dessus : achat exceptionnel ?
        threshold = thresholds.setdefault(account, threshold_for_account(db, account))
        daily_by_account[account].extend(t for t in leftovers if -Decimal(t.amount) < threshold)
        big = [t for t in leftovers if -Decimal(t.amount) >= threshold]
        if not big:
            continue
        reason = f"≥ {threshold:.0f} € : achat exceptionnel ou quotidien ?"
        groups.append(_group("new_purchase", key, big, category="Autre" if is_transfer else (category or "Autre"),
                             reason=reason))

    for account, items in daily_by_account.items():
        if not items:
            continue
        acc = db.get(Account, account)
        g = _group("daily", "", items, reason=f"Sous {thresholds[account]:.0f} € : comptées dans l'enveloppe, sans détail")
        g.label = f"Dépenses du quotidien — {acc.name if acc else ''}"
        months = _months(items)
        g.amount = (g.total / months).quantize(Decimal("1")) if months else g.total
        groups.append(g)

    _categorize_unknown_with_llm(db, user, [g for g in groups if g.kind == "new_purchase" and g.category == "Autre"])
    order = {"contribution": 0, "new_income": 1, "new_charge": 2, "ignore": 3, "daily": 4, "new_purchase": 5}
    groups.sort(key=lambda g: (order[g.kind], -g.total))
    return groups


def _member_first_names(db: Session, account_id: int) -> list[tuple[str, int, str]]:
    out = []
    for u in db.query(User).filter(User.id.in_(account_member_user_ids(db, account_id))).all():
        name = u.display_name or u.ha_username
        first = (rec.normalize_label(name).split() or [""])[0]
        if len(first) >= 3:
            out.append((first, u.id, name))
    return out


def _group(kind: str, key: str, txs: list[BankTransaction], amount: Optional[Decimal] = None,
           category: Optional[str] = None, reason: str = "") -> Group:
    days = sorted(t.date.day for t in txs)
    amounts = [abs(Decimal(t.amount)) for t in txs]
    return Group(
        kind=kind,
        label=key.title() if key else txs[0].label[:60],
        pattern=key,
        tx_ids=[t.id for t in sorted(txs, key=lambda t: t.date)],
        amount=amount if amount is not None else Decimal(str(median(amounts))).quantize(Decimal("0.01")),
        day=days[len(days) // 2],
        months=_months(txs),
        total=sum(amounts, Decimal(0)),
        category=category,
        reason=reason,
        examples=list(dict.fromkeys(t.label for t in txs))[:3],
    )


def apply_group(
    db: Session, user: User, tx_ids: list[int], kind: str, label: str,
    category: Optional[str], amount: Optional[Decimal], create_rule: bool, pattern: Optional[str],
    contributor_user_id: Optional[int] = None,
) -> int:
    """Applique une décision à toutes les opérations du groupe. Retourne le nb traité."""
    allowed = set(accessible_account_ids(db, user.id))
    txs = [
        t for t in db.query(BankTransaction).filter(BankTransaction.id.in_(tx_ids)).order_by(BankTransaction.date)
        if t.account_id in allowed and t.status == rec.TO_REVIEW
        and user_can_write_account(db, user.id, t.account_id)
    ]
    if not txs:
        return 0
    first, rest = txs[0], txs[1:]
    rule_pattern = pattern if create_rule else None
    if kind in ("new_charge", "new_income"):
        rec.resolve(db, first, user, kind, label=label, amount=amount,
                    create_rule=create_rule, rule_pattern=rule_pattern)
        target_kind = first.match_kind
        for t in rest:
            rec.resolve(db, t, user, target_kind, target_id=first.match_id)
    elif kind == "new_purchase":
        rec.resolve(db, first, user, "new_purchase", category=category,
                    create_rule=create_rule, rule_pattern=rule_pattern)
        for t in rest:
            rec.resolve(db, t, user, "new_purchase", category=category)
    elif kind == "daily":
        for t in txs:
            rec.resolve(db, t, user, "daily")
    elif kind == "contribution":
        rec.resolve(db, first, user, "contribution", target_id=contributor_user_id,
                    create_rule=create_rule, rule_pattern=rule_pattern)
        for t in rest:
            rec.resolve(db, t, user, "contribution", target_id=contributor_user_id)
    elif kind == "ignore":
        rec.resolve(db, first, user, "ignore", create_rule=create_rule, rule_pattern=rule_pattern)
        for t in rest:
            rec.resolve(db, t, user, "ignore")
    else:
        raise ValueError(f"Type inconnu : {kind}")
    return len(txs)


CATEGORIES = [c for c, _ in CATEGORY_KEYWORDS] + ["Cadeaux", "Autre"]


def _categorize_unknown_with_llm(db: Session, user: User, groups: list[Group]) -> None:
    """Un seul appel LLM pour tous les commerçants inconnus. Silencieux en cas d'échec :
    les groupes restent en « Autre » et l'utilisateur choisit."""
    from services.llm_client import check_rate_limits, get_llm_client, is_llm_available, record_usage
    if not groups or not is_llm_available():
        return
    names = list(dict.fromkeys(g.label for g in groups))[:120]
    try:
        check_rate_limits(db)
        resp = get_llm_client().chat(
            messages=[{"role": "user", "content": "\n".join(names)}],
            system=(
                "Tu reçois des noms de commerçants issus de relevés bancaires français, un par ligne. "
                f"Classe chacun dans UNE catégorie parmi : {', '.join(CATEGORIES)}. "
                'Réponds UNIQUEMENT en JSON : {"<nom exact>": "<catégorie>", ...}'
            ),
            max_tokens=4000,
        )
        record_usage(db, user.id, resp, kind="categorize")
        txt = (resp.text or "").strip()
        if txt.startswith("```"):
            txt = txt.split("```", 2)[1].removeprefix("json").strip("` \n")
        mapping = json.loads(txt)
    except Exception:  # LLM indisponible, quota, JSON invalide : on garde « Autre »
        logger.warning("Catégorisation IA impossible", exc_info=True)
        return
    for g in groups:
        cat = mapping.get(g.label)
        if cat in CATEGORIES and cat != "Autre":
            g.category = cat
            g.reason += " · catégorie proposée par l'IA"
