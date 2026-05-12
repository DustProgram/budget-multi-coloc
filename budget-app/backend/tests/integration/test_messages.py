"""Tests d'intégration pour la messagerie sur compte joint."""
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models.base import Base
from models import (
    User, Account, AccountMember, AccountMemberRole, AccountType,
    Message, MessageRead,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def setup(db):
    lucas = User(ha_user_id="ha-lucas", ha_username="lucas", display_name="Lucas")
    camille = User(ha_user_id="ha-camille", ha_username="camille", display_name="Camille")
    db.add_all([lucas, camille])
    db.flush()
    joint = Account(
        user_id=lucas.id, bank="CM", type=AccountType.JOINT,
        name="Joint", initial_balance=Decimal("0"),
    )
    db.add(joint)
    db.flush()
    db.add(AccountMember(
        account_id=joint.id, user_id=camille.id, role=AccountMemberRole.COTITULAIRE,
    ))
    db.commit()
    return lucas, camille, joint


def test_post_and_list_messages(db, setup):
    lucas, _, joint = setup
    m1 = Message(account_id=joint.id, user_id=lucas.id, body="On commande à manger ?")
    db.add(m1)
    db.commit()
    msgs = db.query(Message).filter(Message.account_id == joint.id).all()
    assert len(msgs) == 1
    assert msgs[0].body == "On commande à manger ?"


def test_unread_count_excludes_own_messages(db, setup):
    """Mes propres messages ne comptent jamais comme 'non lus' pour moi."""
    lucas, camille, joint = setup
    db.add(Message(account_id=joint.id, user_id=lucas.id, body="Coucou"))
    db.add(Message(account_id=joint.id, user_id=camille.id, body="Salut"))
    db.commit()

    # Compteur unread pour Lucas : seulement le message de Camille
    from datetime import datetime
    last = datetime(1970, 1, 1)
    cnt = db.query(Message).filter(
        Message.account_id == joint.id,
        Message.user_id != lucas.id,
        Message.created_at > last,
    ).count()
    assert cnt == 1


def test_mark_read_zeros_count(db, setup):
    from datetime import datetime
    lucas, camille, joint = setup
    db.add(Message(account_id=joint.id, user_id=camille.id, body="Hello"))
    db.commit()

    # Lucas marque comme lu
    db.add(MessageRead(
        user_id=lucas.id, account_id=joint.id, last_read_at=datetime.utcnow(),
    ))
    db.commit()

    row = db.query(MessageRead).filter(
        MessageRead.user_id == lucas.id, MessageRead.account_id == joint.id,
    ).first()
    cnt = db.query(Message).filter(
        Message.account_id == joint.id,
        Message.user_id != lucas.id,
        Message.created_at > row.last_read_at,
    ).count()
    assert cnt == 0
