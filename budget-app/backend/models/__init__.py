"""
Modèles SQLAlchemy correspondant à la structure de l'Excel.
Optimisés pour SQLite avec indexes appropriés.
"""
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum as SQLEnum, ForeignKey,
    Integer, Numeric, String, Text, Index,
)
from sqlalchemy.orm import relationship

from models.base import Base


# ============================================================
# Enumérations (correspondent aux listes déroulantes Excel)
# ============================================================

class AccountType(str, Enum):
    COURANT = "Compte courant"
    LIVRET_A = "Livret A"
    LDDS = "LDDS"
    LEP = "LEP"
    PEL = "PEL"
    CEL = "CEL"
    PEA = "PEA"
    ASSURANCE_VIE = "Assurance vie"
    JOINT = "Compte joint"
    EPARGNE = "Compte épargne"
    TITRES = "Compte titres"
    AUTRE = "Autre"


class Frequency(str, Enum):
    MENSUELLE = "Mensuelle"
    BIMENSUELLE = "Bimensuelle"
    TRIMESTRIELLE = "Trimestrielle"
    SEMESTRIELLE = "Semestrielle"
    ANNUELLE = "Annuelle"


class SplitMode(str, Enum):
    PERSO = "Perso"
    EGAL = "Égal"
    POURCENTAGE = "Pourcentage"
    MONTANT_FIXE = "Montant fixe"


class IncomeType(str, Enum):
    REGULIER = "Régulier"
    PONCTUEL = "Ponctuel"
    VARIABLE = "Variable"


class PaymentMethod(str, Enum):
    CB = "CB"
    VIREMENT = "Virement"
    ESPECES = "Espèces"
    CHEQUE = "Chèque"
    PRELEVEMENT = "Prélèvement"
    AUTRE = "Autre"


class ShoppingPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class AccountMemberRole(str, Enum):
    OWNER = "owner"
    COTITULAIRE = "cotitulaire"
    VIEWER = "viewer"


# ============================================================
# Utilisateurs (synchros avec HA via Ingress)
# ============================================================

class User(Base):
    """Utilisateurs HA reconnus par l'app. Créés automatiquement à la 1ère connexion."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    ha_user_id = Column(String(64), unique=True, nullable=False, index=True)
    ha_username = Column(String(128), nullable=False)
    display_name = Column(String(128), nullable=True)
    is_admin = Column(Boolean, default=False)
    is_coloc = Column(Boolean, default=True)  # Membre du foyer
    color_hex = Column(String(7), default="#3B82F6")  # Couleur dans l'UI
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    # Token opt-in pour accès au port externe 8765, sous la responsabilité du user.
    # Quand présent, autorise l'accès complet à l'app via ?token=… ou Bearer.
    external_token = Column(String(64), unique=True, nullable=True, index=True)


# ============================================================
# Comptes bancaires (par utilisateur)
# ============================================================

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    bank = Column(String(64), nullable=False)
    type = Column(SQLEnum(AccountType), nullable=False)
    name = Column(String(128), nullable=False)  # Libellé court
    initial_balance = Column(Numeric(12, 2), default=0)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="accounts")
    members = relationship("AccountMember", back_populates="account", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_accounts_user_active", "user_id", "is_active"),
    )


# ============================================================
# Membres d'un compte joint (multi-utilisateurs)
# ============================================================

class AccountMember(Base):
    """Table de jointure compte ↔ user pour les comptes joints.

    Le champ ``Account.user_id`` reste le créateur du compte (owner par défaut).
    Cette table permet d'ajouter des cotitulaires/viewers qui voient le compte
    et ses lignes (charges, transactions) dans leur propre vue.
    """
    __tablename__ = "account_members"

    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role = Column(SQLEnum(AccountMemberRole), nullable=False, default=AccountMemberRole.COTITULAIRE)
    joined_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="members")
    user = relationship("User")


# ============================================================
# Revenus
# ============================================================

class Income(Base):
    __tablename__ = "incomes"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source = Column(String(128), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    day_of_month = Column(Integer, nullable=False)
    type = Column(SQLEnum(IncomeType), default=IncomeType.REGULIER)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)

    user = relationship("User", backref="incomes")
    account = relationship("Account")


# ============================================================
# Charges fixes (avec colocation)
# ============================================================

class Charge(Base):
    __tablename__ = "charges"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    label = Column(String(128), nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)
    frequency = Column(SQLEnum(Frequency), default=Frequency.MENSUELLE)
    day_of_month = Column(Integer, nullable=False)
    month = Column(Integer, nullable=True)  # Pour non-mensuelles
    split_mode = Column(SQLEnum(SplitMode), default=SplitMode.PERSO)
    num_colocs = Column(Integer, default=1)
    split_value = Column(Numeric(10, 2), nullable=True)  # % ou montant fixe
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    is_shared = Column(Boolean, default=False)  # Visible aux colocs
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)

    user = relationship("User", backref="charges")
    account = relationship("Account")
    splits = relationship("ChargeSplit", back_populates="charge", cascade="all, delete-orphan")


class ChargeSplit(Base):
    """Répartition persistée d'une charge partagée sur un compte joint.

    Créé automatiquement à l'insert d'une `Charge` portée par un compte avec
    `AccountMember`. Permet de marquer chaque part comme remboursée (`settled_at`)
    et de calculer "qui doit quoi à qui" sans recalculer depuis zéro.
    """
    __tablename__ = "charge_splits"

    id = Column(Integer, primary_key=True)
    charge_id = Column(Integer, ForeignKey("charges.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    settled_at = Column(DateTime, nullable=True)

    charge = relationship("Charge", back_populates="splits")
    user = relationship("User")


# ============================================================
# Virements interbancaires (récurrents + ponctuels)
# ============================================================

class RecurringTransfer(Base):
    __tablename__ = "recurring_transfers"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    label = Column(String(128), nullable=False)
    source_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    dest_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    day_of_month = Column(Integer, nullable=False)
    frequency = Column(SQLEnum(Frequency), default=Frequency.MENSUELLE)
    is_active = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)


class OneTimeTransfer(Base):
    __tablename__ = "onetime_transfers"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    label = Column(String(128), nullable=False)
    source_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    dest_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    notes = Column(Text, nullable=True)


# ============================================================
# Épargne mensuelle automatique multi-lignes
# ============================================================

class AutoSaving(Base):
    __tablename__ = "auto_savings"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    label = Column(String(128), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    source_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    dest_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    day_of_month = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)


# ============================================================
# Achats avec paiements en plusieurs fois
# ============================================================

class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    description = Column(String(256), nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)
    nb_installments = Column(Integer, default=1)  # 1 = paiement immédiat
    category = Column(String(64), nullable=True)
    payment_method = Column(SQLEnum(PaymentMethod), default=PaymentMethod.CB)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    notes = Column(Text, nullable=True)

    user = relationship("User", backref="purchases")
    account = relationship("Account")

    __table_args__ = (
        Index("ix_purchases_user_date", "user_id", "date"),
    )

    @property
    def monthly_amount(self) -> Decimal:
        """Montant par mensualité (= total / nb)."""
        if self.nb_installments <= 1:
            return self.total_amount
        return self.total_amount / self.nb_installments


# ============================================================
# Liste de courses (partagée entre colocs)
# ============================================================

class ShoppingItem(Base):
    __tablename__ = "shopping_items"

    id = Column(Integer, primary_key=True)
    label = Column(String(128), nullable=False)
    quantity = Column(String(32), nullable=True)  # "2", "500g", "1 pack"
    category = Column(String(64), nullable=True)  # Frais, Sec, Hygiène, ...
    priority = Column(SQLEnum(ShoppingPriority), default=ShoppingPriority.NORMAL)
    estimated_price = Column(Numeric(10, 2), nullable=True)
    is_bought = Column(Boolean, default=False)
    bought_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    bought_at = Column(DateTime, nullable=True)
    actual_price = Column(Numeric(10, 2), nullable=True)
    notes = Column(Text, nullable=True)

    added_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    added_by = relationship("User", foreign_keys=[added_by_user_id])
    bought_by = relationship("User", foreign_keys=[bought_by_user_id])

    __table_args__ = (
        Index("ix_shopping_active", "is_bought"),
    )


# ============================================================
# Paramètres globaux (un seul enregistrement)
# ============================================================

class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, default=1)
    current_month = Column(Integer, default=1)  # 1-12
    current_year = Column(Integer, default=2026)
    alert_threshold = Column(Numeric(10, 2), default=50)
    alert_enabled = Column(Boolean, default=True)
    last_backup_at = Column(DateTime, nullable=True)
    categories = Column(Text, default="Alimentation,Transport,Loisirs,Vêtements,Santé,Restaurants,Cadeaux,Maison,Tech / Abonnements,Voyages,Sport,Autre")


# ============================================================
# Catégories de courses (configurables)
# ============================================================

class ShoppingCategory(Base):
    __tablename__ = "shopping_categories"

    id = Column(Integer, primary_key=True)
    label = Column(String(64), nullable=False, unique=True)
    icon = Column(String(64), nullable=True)  # nom Material Icon
    order = Column(Integer, default=0)
