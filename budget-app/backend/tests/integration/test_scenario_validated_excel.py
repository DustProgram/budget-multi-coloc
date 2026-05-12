"""
Test d'intégration reproduisant exactement le scénario validé sur l'Excel.

Scénario juin 2026 :
- 3 comptes : BRED Courant (1200), BRED Livret A (3500), Bourso (500)
- Revenus : 1400€ salaire + 200€ APL + 150€ prime
- Virement récurrent : BRED Courant → Bourso 200€/mois
- Virement ponctuel : BRED Courant → Bourso 50€ le 20/06
- Charges : Loyer 600€/3, Élec 50€/3, Internet 30€/3 (coloc à 3), Mobile 15€ perso
- Épargne : 50€ vers Livret A, 30€ vers Livret A depuis Bourso
- Achats :
  * 12/06 Courses 60€ (1x)
  * 15/06 Ordi 600€ en 3x → 200€ en juin
  * 01/05 Meuble 400€ en 4x → 100€ en juin
  * 20/04 Voyage 300€ en 3x → 100€ en juin
  * 15/07 Hors période 50€ → 0€ en juin

Résultats attendus :
- Revenus juin : 1750€
- Charges juin : 241.67€ (680/3 + 15)
- Épargne juin : 80€
- Achats imputés juin : 460€ (60 + 200 + 100 + 100)
- Solde dispo : 1750 - 241.67 - 80 - 460 = 968.33€
- BRED Courant fin : 1200 + 1400 - 250 - 226.67 - 50 - 300 = 1773.33€
- BRED Livret A fin : 3500 + 80 = 3580€
- Bourso fin : 500 + 350 + 250 - 15 - 30 - 160 = 895€
"""
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models.base import Base
from models import (
    User, Account, Income, Charge, RecurringTransfer, OneTimeTransfer,
    AutoSaving, Purchase, AccountType, Frequency, SplitMode, IncomeType, PaymentMethod,
)
from services.budget_calc import compute_monthly_budget, simulate_purchase


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def setup_scenario(db):
    """Setup du scénario complet."""
    # Utilisateur
    user = User(ha_user_id="test-user", ha_username="test", display_name="Test", is_admin=True)
    db.add(user)
    db.flush()

    # Comptes
    bred_courant = Account(user_id=user.id, bank="BRED", type=AccountType.COURANT,
                            name="BRED Courant", initial_balance=Decimal("1200"))
    bred_livret = Account(user_id=user.id, bank="BRED", type=AccountType.LIVRET_A,
                           name="BRED Livret A", initial_balance=Decimal("3500"))
    bourso = Account(user_id=user.id, bank="Boursorama", type=AccountType.COURANT,
                      name="Bourso", initial_balance=Decimal("500"))
    db.add_all([bred_courant, bred_livret, bourso])
    db.flush()

    # Revenus
    db.add_all([
        Income(user_id=user.id, source="Salaire", amount=Decimal("1400"),
               day_of_month=28, type=IncomeType.REGULIER, account_id=bred_courant.id),
        Income(user_id=user.id, source="APL", amount=Decimal("200"),
               day_of_month=5, type=IncomeType.REGULIER, account_id=bourso.id),
        Income(user_id=user.id, source="Prime", amount=Decimal("150"),
               day_of_month=5, type=IncomeType.REGULIER, account_id=bourso.id),
    ])

    # Virements
    db.add(RecurringTransfer(
        user_id=user.id, label="Vers Bourso",
        source_account_id=bred_courant.id, dest_account_id=bourso.id,
        amount=Decimal("200"), day_of_month=1, frequency=Frequency.MENSUELLE,
    ))
    db.add(OneTimeTransfer(
        user_id=user.id, label="Ponctuel", date=date(2026, 6, 20),
        source_account_id=bred_courant.id, dest_account_id=bourso.id,
        amount=Decimal("50"),
    ))

    # Charges (coloc à 3)
    db.add_all([
        Charge(user_id=user.id, label="Loyer", total_amount=Decimal("600"),
               frequency=Frequency.MENSUELLE, day_of_month=5,
               split_mode=SplitMode.EGAL, num_colocs=3, account_id=bred_courant.id),
        Charge(user_id=user.id, label="Élec", total_amount=Decimal("50"),
               frequency=Frequency.MENSUELLE, day_of_month=10,
               split_mode=SplitMode.EGAL, num_colocs=3, account_id=bred_courant.id),
        Charge(user_id=user.id, label="Internet", total_amount=Decimal("30"),
               frequency=Frequency.MENSUELLE, day_of_month=15,
               split_mode=SplitMode.EGAL, num_colocs=3, account_id=bred_courant.id),
        Charge(user_id=user.id, label="Mobile", total_amount=Decimal("15"),
               frequency=Frequency.MENSUELLE, day_of_month=2,
               split_mode=SplitMode.PERSO, account_id=bourso.id),
    ])

    # Épargne
    db.add_all([
        AutoSaving(user_id=user.id, label="Livret A", amount=Decimal("50"),
                   source_account_id=bred_courant.id, dest_account_id=bred_livret.id,
                   day_of_month=30, is_active=True),
        AutoSaving(user_id=user.id, label="Bourso ép", amount=Decimal("30"),
                   source_account_id=bourso.id, dest_account_id=bred_livret.id,
                   day_of_month=25, is_active=True),
    ])

    # Achats
    db.add_all([
        Purchase(user_id=user.id, date=date(2026, 6, 12), description="Courses",
                 total_amount=Decimal("60"), nb_installments=1,
                 category="Alimentation", payment_method=PaymentMethod.CB, account_id=bourso.id),
        Purchase(user_id=user.id, date=date(2026, 6, 15), description="Ordi",
                 total_amount=Decimal("600"), nb_installments=3,
                 category="Tech", payment_method=PaymentMethod.CB, account_id=bred_courant.id),
        Purchase(user_id=user.id, date=date(2026, 5, 1), description="Meuble",
                 total_amount=Decimal("400"), nb_installments=4,
                 category="Maison", payment_method=PaymentMethod.CB, account_id=bourso.id),
        Purchase(user_id=user.id, date=date(2026, 4, 20), description="Voyage",
                 total_amount=Decimal("300"), nb_installments=3,
                 category="Voyages", payment_method=PaymentMethod.CB, account_id=bred_courant.id),
        Purchase(user_id=user.id, date=date(2026, 7, 15), description="Hors période",
                 total_amount=Decimal("50"), nb_installments=1,
                 category="Loisirs", payment_method=PaymentMethod.CB, account_id=bourso.id),
    ])

    db.commit()
    return user, [bred_courant, bred_livret, bourso]


def test_incomes_juin(db, setup_scenario):
    user, _ = setup_scenario
    budget = compute_monthly_budget(db, user.id, 2026, 6)
    assert budget.total_incomes == Decimal("1750")


def test_charges_juin(db, setup_scenario):
    user, _ = setup_scenario
    budget = compute_monthly_budget(db, user.id, 2026, 6)
    # 600/3 + 50/3 + 30/3 + 15 = 200 + 16.67 + 10 + 15 = 241.67
    expected = Decimal("600") / 3 + Decimal("50") / 3 + Decimal("30") / 3 + Decimal("15")
    assert abs(budget.total_charges - expected) < Decimal("0.01")


def test_savings_juin(db, setup_scenario):
    user, _ = setup_scenario
    budget = compute_monthly_budget(db, user.id, 2026, 6)
    assert budget.total_savings == Decimal("80")


def test_purchases_imputed_juin(db, setup_scenario):
    """Le test critique : les mensualités doivent être correctement imputées."""
    user, _ = setup_scenario
    budget = compute_monthly_budget(db, user.id, 2026, 6)
    # 60 (courses 1x juin) + 200 (ordi 3x 1ère mens) + 100 (meuble 4x 2ème mens)
    # + 100 (voyage 3x 3ème mens) = 460
    # L'achat de juillet (50€) ne doit PAS être compté
    assert budget.total_purchases_imputed == Decimal("460")


def test_purchases_juillet(db, setup_scenario):
    user, _ = setup_scenario
    budget = compute_monthly_budget(db, user.id, 2026, 7)
    # 50 (hors période) + 200 (ordi 2ème mens) + 100 (meuble 3ème mens) = 350
    assert budget.total_purchases_imputed == Decimal("350")


def test_purchases_aout(db, setup_scenario):
    user, _ = setup_scenario
    budget = compute_monthly_budget(db, user.id, 2026, 8)
    # 200 (ordi 3ème mens) + 100 (meuble 4ème mens) = 300
    assert budget.total_purchases_imputed == Decimal("300")


def test_account_bred_courant(db, setup_scenario):
    user, accounts = setup_scenario
    budget = compute_monthly_budget(db, user.id, 2026, 6)

    bred_courant = next(a for a in budget.accounts if a.account_name == "BRED Courant")
    # 1200 + 1400 - 250 (virements) - 226.67 (charges) - 50 (épargne sortante)
    # - 300 (ordi 200 + voyage 100) = 1773.33
    expected = Decimal("1200") + Decimal("1400") - Decimal("250") \
               - (Decimal("600")/3 + Decimal("50")/3 + Decimal("30")/3) \
               - Decimal("50") - Decimal("300")
    assert abs(bred_courant.final_balance - expected) < Decimal("0.01")


def test_account_bourso(db, setup_scenario):
    user, _ = setup_scenario
    budget = compute_monthly_budget(db, user.id, 2026, 6)

    bourso = next(a for a in budget.accounts if a.account_name == "Bourso")
    # 500 + 350 (APL + Prime) + 250 (virements) - 15 (mobile) - 30 (épargne)
    # - 160 (courses 60 + meuble 100) = 895
    expected = Decimal("895")
    assert abs(bourso.final_balance - expected) < Decimal("0.01")


def test_account_livret_a(db, setup_scenario):
    user, _ = setup_scenario
    budget = compute_monthly_budget(db, user.id, 2026, 6)

    livret = next(a for a in budget.accounts if a.account_name == "BRED Livret A")
    # 3500 + 80 (épargne entrante) = 3580
    assert livret.final_balance == Decimal("3580")


def test_simulation_purchase_possible(db, setup_scenario):
    user, accounts = setup_scenario
    bourso = next(a for a in accounts if a.name == "Bourso")

    sim = simulate_purchase(db, user.id, Decimal("100"), bourso.id, 2026, 6, Decimal("50"))
    assert sim.can_afford_global is True
    assert sim.can_afford_account is True
    assert "✅" in sim.verdict_message


def test_simulation_purchase_too_much(db, setup_scenario):
    user, accounts = setup_scenario
    bourso = next(a for a in accounts if a.name == "Bourso")

    # Bourso a 895€ de solde fin, donc tenter 1000€ doit échouer
    sim = simulate_purchase(db, user.id, Decimal("1000"), bourso.id, 2026, 6)
    assert sim.can_afford_account is False
