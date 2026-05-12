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
    # Par utilisateur : chaque membre du joint a son propre montant configurable.
    # Le payeur est le compte joint lui-même (l'argent sort du joint vers un
    # organisme externe), chacun abonde le joint via virement de sa part.
    PAR_UTILISATEUR = "Par utilisateur"


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


class ExternalScope(str, Enum):
    """Niveau d'accès d'un compte externe sur le port 8765.

    - 'coloc' : liste de courses, chat, récap coloc uniquement
    - 'full'  : accès complet à l'app (équivalent ingress HA)
    """
    COLOC = "coloc"
    FULL = "full"


class CustomEventKind(str, Enum):
    PERSO = "perso"          # rappel personnel (médecin, rendez-vous)
    COLOC = "coloc"          # événement partagé (apéro, ménage)
    FAMILLE = "famille"
    PRO = "pro"              # rendez-vous client, deadline facture
    AUTRE = "autre"


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
    # Quand True, l'UI affiche le switcher Perso/Pro et la rubrique Compta-pro.
    # Utilisable pour micro-entrepreneur / freelance qui veut un suivi séparé.
    pro_enabled = Column(Boolean, default=False)


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
    # 'perso' (par défaut) ou 'pro' pour les comptes liés à l'activité professionnelle.
    # L'UI filtre via le switcher Perso/Pro quand pro_enabled est activé sur l'user.
    space = Column(String(8), default="perso", nullable=False, index=True)

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
    # Période de validité (optionnelle) — pour gérer changements de salaire
    # ou revenus temporaires sans perdre l'historique.
    valid_from = Column(Date, nullable=True)
    valid_to = Column(Date, nullable=True)

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
    # Période de validité (optionnelle) — pour gérer charges qui démarrent
    # ou expirent (ex : abonnement Netflix de mars à juillet seulement).
    valid_from = Column(Date, nullable=True)
    valid_to = Column(Date, nullable=True)

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
    valid_from = Column(Date, nullable=True)
    valid_to = Column(Date, nullable=True)


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
    valid_from = Column(Date, nullable=True)
    valid_to = Column(Date, nullable=True)


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


# ============================================================
# Événements custom dans le planning (rappels, RDV, apéros…)
# ============================================================

class CustomEvent(Base):
    """Événement non-bancaire affiché dans le calendrier.

    Si is_shared = True et account_id pointe sur un compte joint, tous les
    membres du compte voient l'événement. Sinon l'événement est strictement
    perso (visible par l'user créateur uniquement).
    """
    __tablename__ = "custom_events"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    label = Column(String(128), nullable=False)
    kind = Column(SQLEnum(CustomEventKind), default=CustomEventKind.PERSO)
    description = Column(Text, nullable=True)
    is_shared = Column(Boolean, default=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)  # pour partage via compte joint
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    account = relationship("Account")


# ============================================================
# Messagerie inter-user sur compte joint
# ============================================================

class Message(Base):
    """Message posté sur un compte joint OU un foyer (household).

    Au moins l'un des deux scope (account_id ou household_id) doit être
    renseigné. Permet de garder l'ancien chat par compte joint tout en
    introduisant un chat global au foyer (référence privilégiée à partir
    de 0.4).
    """
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User")
    account = relationship("Account")
    household = relationship("Household")


class MessageRead(Base):
    """Pointeur du dernier message lu par chaque user sur chaque compte.
    Permet de calculer le compteur 'non lus' sans table de read-receipts par message."""
    __tablename__ = "message_reads"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True)
    last_read_at = Column(DateTime, default=datetime.utcnow)


# ============================================================
# Foyer (household) — groupe de coloc explicite
# ============================================================

class Household(Base):
    """Un foyer (coloc, famille…). Liste explicite de qui vit avec qui.
    Sert d'ancrage pour la liste de courses partagée, le chat global et
    plus tard les charges réparties auto par défaut entre tous les membres."""
    __tablename__ = "households"

    id = Column(Integer, primary_key=True)
    name = Column(String(128), nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    members = relationship("HouseholdMember", back_populates="household",
                            cascade="all, delete-orphan")


class HouseholdMember(Base):
    __tablename__ = "household_members"

    household_id = Column(Integer, ForeignKey("households.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at = Column(DateTime, default=datetime.utcnow)

    household = relationship("Household", back_populates="members")
    user = relationship("User")


class HouseholdMessageRead(Base):
    """Pointeur de lecture du chat foyer par user."""
    __tablename__ = "household_message_reads"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    household_id = Column(Integer, ForeignKey("households.id", ondelete="CASCADE"), primary_key=True)
    last_read_at = Column(DateTime, default=datetime.utcnow)


# ============================================================
# Comptes externes (port 8765) avec username + password
# ============================================================

class ExternalCredential(Base):
    """Credentials d'accès au port externe (8765) sans passer par HA.

    Un user HA peut créer son compte externe avec username + password
    (hashé bcrypt) et choisir un scope d'accès. Pratique pour partager
    un accès limité à un coloc ('coloc' = courses + chat seulement)
    ou pour soi-même un accès complet hors LAN.
    """
    __tablename__ = "external_credentials"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    scope = Column(SQLEnum(ExternalScope), default=ExternalScope.FULL, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)


# ============================================================
# Chat IA (Claude API + function calling)
# ============================================================

class ChatConversation(Base):
    """Conversation avec l'assistant IA, scopée par user."""
    __tablename__ = "chat_conversations"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(160), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ChatMessage(Base):
    """Tour de conversation : user, assistant (avec ou sans tool_calls) ou tool result."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(
        Integer, ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    role = Column(String(20), nullable=False)  # 'user' | 'assistant'
    content = Column(Text, nullable=True)
    tool_calls = Column(Text, nullable=True)  # JSON: list of {id, name, input}
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ChatAction(Base):
    """Action proposée ou exécutée par l'IA. Permet confirmation > 50€ et undo."""
    __tablename__ = "chat_actions"

    id = Column(Integer, primary_key=True)
    message_id = Column(
        Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tool_name = Column(String(60), nullable=False)
    tool_input = Column(Text, nullable=False)  # JSON
    status = Column(String(20), default="executed", nullable=False)
    # 'pending'   : en attente de confirmation utilisateur (montant >= 50€)
    # 'executed'  : déjà appliqué en DB
    # 'cancelled' : refusé par l'utilisateur
    # 'undone'    : exécuté puis annulé manuellement
    entity_type = Column(String(40), nullable=True)
    entity_id = Column(Integer, nullable=True)
    result = Column(Text, nullable=True)  # JSON: réponse renvoyée à Claude
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    executed_at = Column(DateTime, nullable=True)

    user = relationship("User")
