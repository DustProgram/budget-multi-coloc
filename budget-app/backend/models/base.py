"""
Configuration SQLAlchemy + SQLite optimisée pour HA Green.
Active WAL mode pour de meilleures perfs et éviter les blocages.
"""
import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./budget.db?check_same_thread=False")

Base = declarative_base()

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Active WAL mode + autres optimisations SQLite."""
    if "sqlite" in str(engine.url):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=-32000")  # 32 Mo de cache
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.execute("PRAGMA mmap_size=134217728")  # 128 Mo memory-map
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency FastAPI pour injection de session DB."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Crée toutes les tables (idempotent)."""
    # Assurer que le dossier de la DB existe
    if "sqlite" in DATABASE_URL:
        db_path = DATABASE_URL.split("///")[1].split("?")[0]
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    # Importer tous les modèles pour qu'ils soient enregistrés
    from models import (  # noqa: F401
        User, Account, AccountMember, Income, Charge, ChargeSplit,
        RecurringTransfer, OneTimeTransfer, AutoSaving, Purchase,
        ShoppingItem, Settings, ShoppingCategory,
        CustomEvent, Message, MessageRead,
        ExternalCredential,
        Household, HouseholdMember, HouseholdMessageRead,
    )

    Base.metadata.create_all(bind=engine)

    # Migration ad-hoc : ajout de colonnes pour les DB déjà créées par une
    # ancienne version d'init_db. create_all ne fait pas d'ALTER TABLE.
    _migrate_add_column_if_missing("users", "external_token", "TEXT")
    _create_index_if_missing("ix_users_external_token", "users", "external_token", unique=True)
    _migrate_add_column_if_missing("users", "pro_enabled", "BOOLEAN DEFAULT 0")
    _migrate_add_column_if_missing("accounts", "space", "VARCHAR(8) DEFAULT 'perso' NOT NULL")
    _create_index_if_missing("ix_accounts_space", "accounts", "space")
    # household_id sur messages (nullable, ancien chat par compte conservé)
    _migrate_add_column_if_missing("messages", "household_id", "INTEGER")
    _create_index_if_missing("ix_messages_household_id", "messages", "household_id")
    # messages.account_id passe de NOT NULL à nullable (chat foyer en 0.4).
    # SQLite ne supporte pas ALTER COLUMN — il faut recréer la table.
    _migrate_messages_account_id_nullable()

    # Créer les paramètres par défaut si table vide
    db = SessionLocal()
    try:
        if not db.query(Settings).first():
            db.add(Settings())
            db.commit()
    finally:
        db.close()


def _migrate_add_column_if_missing(table: str, column: str, sql_type: str) -> None:
    """Idempotent: ALTER TABLE … ADD COLUMN si la colonne n'existe pas déjà."""
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        existing = {r[1] for r in rows}
        if column not in existing:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}"))
            conn.commit()


def _create_index_if_missing(name: str, table: str, column: str, unique: bool = False) -> None:
    from sqlalchemy import text
    u = "UNIQUE " if unique else ""
    with engine.connect() as conn:
        conn.execute(text(f"CREATE {u}INDEX IF NOT EXISTS {name} ON {table}({column})"))
        conn.commit()


def _migrate_messages_account_id_nullable() -> None:
    """Si messages.account_id est encore NOT NULL (DB créée avant 0.4),
    on recrée la table avec account_id nullable. SQLite ne supporte pas
    ``ALTER TABLE ... ALTER COLUMN``.

    Idempotent : ne fait rien si la colonne est déjà nullable.
    """
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(messages)")).fetchall()
        if not rows:
            return  # table pas encore créée
        col = next((r for r in rows if r[1] == "account_id"), None)
        if col is None or col[3] == 0:
            return  # déjà nullable
        # Recréer la table
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("ALTER TABLE messages RENAME TO _messages_old"))
        conn.execute(text("""
            CREATE TABLE messages (
                id INTEGER PRIMARY KEY,
                account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
                household_id INTEGER REFERENCES households(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                body TEXT NOT NULL,
                created_at DATETIME
            )
        """))
        conn.execute(text("""
            INSERT INTO messages (id, account_id, household_id, user_id, body, created_at)
            SELECT id, account_id, household_id, user_id, body, created_at FROM _messages_old
        """))
        conn.execute(text("DROP TABLE _messages_old"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_account_id ON messages(account_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_household_id ON messages(household_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_created_at ON messages(created_at)"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()
