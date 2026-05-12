# 🤖 Guide pour Claude Code

Ce fichier est destiné à Claude Code (terminal) pour continuer le développement après le squelette initial.

## État actuel

✅ **Phase 0 - Foundation (squelette)** : structure complète, modèles DB, logique de calcul, scénario test validé (11/11)

⏳ **À implémenter (Phases 1-6)** : endpoints CRUD complets, frontend React, sécurité, tests E2E

## Architecture & conventions

### Backend
- Python 3.12, FastAPI, SQLAlchemy 2.0 (style moderne)
- Pas de migrations Alembic pour l'instant (auto-create via `Base.metadata.create_all`)
- Pattern endpoints : voir `api/shopping.py` comme référence complète
- Décimaux : toujours `Decimal`, jamais `float`
- Dates : `date` pour les dates, `datetime` pour les timestamps

### Frontend
- React 18 + TypeScript strict + Vite + Tailwind CSS
- React Query pour le data fetching (pas d'état global type Redux)
- Lucide pour les icônes
- Recharts pour les graphiques

### Sécurité
- L'auth est gérée par le middleware `services/auth.py` (récupère `request.state.user`)
- Pas de besoin de JWT/sessions, l'Ingress HA fait tout

## Prochaines tâches (ordre recommandé)

### 1. Endpoints CRUD complets

Copier la structure de `api/shopping.py` pour :
- `api/accounts.py` (déjà stub)
- `api/incomes.py`
- `api/charges.py` (attention au calcul de `compute_my_share`)
- `api/transfers.py` (récurrents + ponctuels)
- `api/savings.py`
- `api/purchases.py` (avec gestion des mensualités)

Pour chaque entité : `GET /`, `POST /`, `PATCH /{id}`, `DELETE /{id}` avec validation Pydantic et filtrage par `user_id` (récupéré depuis `request.state.user`).

### 2. Endpoints calculés

- `api/dashboard.py` : appelle `compute_monthly_budget` et retourne JSON
- `api/simulator.py` : appelle `simulate_purchase`
- `api/coloc.py` : appelle `compute_coloc_breakdown` + génération PDF via `generate_coloc_pdf`

### 3. Frontend (par page)

Pour chaque page sous `frontend/src/pages/` :
- Hook React Query pour fetch
- Form pour create/edit (avec validation)
- Table/grid pour list
- Style avec Tailwind, design moderne

Référence visuelle : voir le fichier Excel pour l'organisation des colonnes et la hiérarchie.

### 4. Tests à ajouter

```
backend/tests/unit/
  test_compute_my_share.py     # Tous les modes (Perso/Égal/%/Fixe)
  test_purchase_imputation.py  # Tous les cas (1x, 3x, hors période)
  test_charge_active.py        # Mensuelles vs non-mensuelles

backend/tests/integration/
  test_api_accounts.py
  test_api_shopping.py
  test_coloc_breakdown.py

backend/tests/e2e/
  test_full_user_journey.py    # Playwright (optionnel)
```

### 5. PWA & mode hors-ligne

- Configurer le service worker (déjà dans `vite.config.ts`)
- Cache des requêtes GET pour fonctionner offline
- Synchronisation des écritures en attente quand la connexion revient

## Commandes utiles

```bash
# Dev backend
cd budget-app/backend
DEV_MODE=true DATABASE_URL="sqlite:///./dev.db" \
  python -m uvicorn main:app --reload --port 8000

# Dev frontend
cd budget-app/frontend
npm run dev

# Tests backend
cd budget-app/backend
pytest -v

# Tests frontend
cd budget-app/frontend
npm test

# Build local Docker
cd budget-app
docker build -t budget-test .
```

## Tips importants

- **Toujours filtrer par `user_id`** dans les requêtes (sauf shopping/coloc qui sont partagés)
- **WAL mode SQLite est crucial** pour les perfs sur eMMC HA Green
- **Ne pas écrire trop souvent** sur la DB (eMMC a une endurance limitée)
- **Le scénario de test `test_scenario_validated_excel.py` doit toujours passer** (c'est la régression de référence)
- **Pour l'eMMC** : éviter les logs verbeux en prod, batchs d'écriture si possible

## Bonus (idées d'extensions)

- Notifications HA quand seuil dépassé (via `homeassistant_api`)
- Cartes dashboard HA personnalisées (lovelace cards)
- Import CSV depuis relevés bancaires
- Export OFX pour comptabilité
- Mode "famille" avec sous-comptes enfants
