# 🤖 Guide pour Claude Code

Add-on Home Assistant **Budget Multi-Coloc**. Tout le code de prod vit dans `budget-app/`. Aucun service cloud — données stockées sur clé USB LUKS branchée à la box HA.

## État actuel

✅ **Phase 0 — Foundation** : structure complète, modèles DB, logique de calcul.
✅ **Phase 1 — Backend CRUD** : tous les endpoints implémentés (`accounts`, `incomes`, `charges`, `transfers`, `savings`, `purchases`, `shopping`, `coloc`, `simulator`, `dashboard`, `calendar`). 17/17 tests verts (régression Excel + tests API charges).
✅ **Phase 1 — Frontend de base** : 13 pages branchées (React Query + axios + ingress prefix auto). Design Tailwind générique slate/emerald, **à remplacer par le look Handoff**.
⏳ **Phase 2 — Design Handoff** : palette terra/sage/plum/ink + Instrument Serif/Geist, sidebar collapsible, donut/sparkline custom, mobile nav. Référence dans `project/styles.css` + `project/pages.jsx`.
⏳ **Phase 3 — Multi-users** : table `account_members` (compte joint réel), `charge_splits` avec `settled_at`, min-cash-flow simplification, partage via picker user HA (pas d'email — l'ingress fait l'auth).
⏳ **Phase 4 — Build add-on** : pytest + npm build + docker build verts.
⏳ **Phase 5** : PWA + offline + extras (notifs HA, lovelace cards, import CSV).

## Architecture & conventions

### Backend
- Python 3.12, FastAPI, SQLAlchemy 2.0 (style moderne)
- SQLite **WAL** sur la clé USB (`/data/budget.db`), PRAGMAs eMMC-friendly dans `models/base.py`
- Pas de migrations Alembic — `Base.metadata.create_all` au démarrage (idempotent)
- Pattern endpoints : voir `api/shopping.py` ou `api/accounts.py` comme référence
- Décimaux : toujours `Decimal`, jamais `float`
- Dates : `date` pour les dates, `datetime` pour les timestamps

### Frontend
- React 18 + TypeScript strict + Vite (PWA via `vite-plugin-pwa`)
- React Query pour le data fetching (pas d'état global type Redux)
- axios avec préfixe ingress auto-détecté (`lib/api.ts`)
- Lucide pour les icônes, Recharts pour les graphiques (à compléter par charts SVG custom du Handoff)

### Sécurité
- Auth via middleware HA Ingress : `services/auth.py` lit `X-Remote-User-Id` et injecte `request.state.user`
- Pas de JWT/session — l'ingress HA tranche
- Port externe `8765` ouvert pour les modules `courses` et `coloc-summary` uniquement (config dans `EXTERNAL_MODULES`)

### Données partagées vs perso
- **Filtrage par `user_id`** par défaut (accounts, incomes, charges, transfers, savings, purchases)
- **Ressources partagées sans filtrage** : `shopping` (toute la coloc), `coloc` (récap)
- **Phase 3** introduit `account_members` → un compte joint sera visible à plusieurs `user_id`

## Prochaines tâches

### Phase 2 — Design Handoff (frontend)

Sources :
- `project/styles.css` (604 lignes — palette CSS complète, tokens, composants)
- `project/pages.jsx` (référence visuelle de chaque page)
- Composants charts custom à recréer (Sparkline, Donut, BalanceCurve, YearChart) — peuvent être récupérés via `git show 291b742:app/components/charts/<file>.tsx` (avant suppression de `app/`)

À faire dans `budget-app/frontend/src/` :
1. Remplacer `index.css` (et `tailwind.config.js`) par les tokens du Handoff (variables CSS, typo Instrument Serif/Geist, palette terra/sage/plum/ink)
2. Recréer `components/charts/{Sparkline,Donut,BalanceCurve,YearChart}.tsx` en SVG pur
3. Recréer `components/ui/{Avatar,EmptyState}.tsx`
4. Refondre `components/Layout.tsx` en sidebar collapsible + mobile nav + tweaks panel
5. Réécrire les 12 pages avec le nouveau look, en gardant les hooks React Query existants

### Phase 3 — Multi-users (backend + frontend)

Backend (nouvelles tables + endpoints) :
1. `models/__init__.py` — ajouter :
   - `AccountMember(account_id, user_id, role)` avec role enum `owner|cotitulaire|viewer`
   - `ChargeSplit(charge_id, user_id, amount, settled_at)`
2. Trigger Python à l'insert d'une `Charge` partagée → générer auto les `ChargeSplit` selon le mode
3. Endpoints :
   - `POST /accounts/{id}/members` (admin pick un user HA)
   - `DELETE /accounts/{id}/members/{user_id}`
   - `POST /charges/{id}/splits/{split_id}/settle` et `/unsettle`
4. Réécrire `services/coloc_split.py` : remplacer le "owes_to" naïf par **min-cash-flow** (n-1 virements max)
5. Mettre à jour les RLS logiques : un user voit ses comptes + les comptes où il est dans `account_members`

Frontend :
- Modale "Inviter co-titulaire" sur la page Accounts (dropdown des users HA dispo)
- AvatarStack des membres sur chaque carte compte
- Page Coloc : bouton "Marquer remboursé" par split

### Phase 4 — Build add-on local

```bash
# Backend tests
cd budget-app/backend && .venv/bin/python -m pytest tests/ -v

# Frontend build
cd budget-app/frontend && npm run build

# Add-on Docker (architecture locale)
cd budget-app && docker build -t budget-test .
```

## Setup dev (une seule fois)

```bash
# Backend — Python 3.12 via Homebrew
brew install python@3.12
cd budget-app/backend
/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt pytest pytest-asyncio httpx

# Frontend
cd budget-app/frontend
npm install
```

## Commandes utiles

```bash
# Dev backend (DEV_MODE bypass l'auth ingress, user de test "Dev User")
cd budget-app/backend
DEV_MODE=true DATABASE_URL="sqlite:///./dev.db?check_same_thread=False" \
  .venv/bin/python -m uvicorn main:app --reload --port 8000

# Dev frontend
cd budget-app/frontend
npm run dev

# Tests backend (tous, verbose)
cd budget-app/backend
.venv/bin/python -m pytest tests/ -v
```

## Tips importants

- **Toujours filtrer par `user_id`** dans les requêtes — sauf `shopping` et `coloc` qui sont partagés
- **WAL mode SQLite est crucial** pour l'eMMC HA Green (déjà dans `models/base.py`)
- **Endurance eMMC** : éviter logs verbeux en prod, batch les écritures si possible
- **Le scénario `test_scenario_validated_excel.py` doit toujours passer** — c'est la régression de référence
- **Récupérer un fichier de l'ex-`app/`** : `git show 291b742:app/components/charts/Donut.tsx > /tmp/Donut.tsx`

## Bonus (idées d'extensions)

- Notifications HA quand seuil dépassé (via `homeassistant_api`)
- Cartes lovelace HA personnalisées
- Import CSV depuis relevés bancaires
- Export OFX pour comptabilité
- Mode "famille" avec sous-comptes enfants
