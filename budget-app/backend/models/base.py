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
    )

    Base.metadata.create_all(bind=engine)

    # Migration ad-hoc : ajout de colonnes pour les DB déjà créées par une
    # ancienne version d'init_db. create_all ne fait pas d'ALTER TABLE.
    _migrate_add_column_if_missing("users", "external_token", "TEXT")
    _create_index_if_missing("ix_users_external_token", "users", "external_token", unique=True)
    _migrate_add_column_if_missing("users", "pro_enabled", "BOOLEAN DEFAULT 0")
    _migrate_add_column_if_missing("accounts", "space", "VARCHAR(8) DEFAULT 'perso' NOT NULL")
    _create_index_if_missing("ix_accounts_space", "accounts", "space")

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
