# 🤖 Guide pour Claude Code

Add-on Home Assistant **Budget Multi-Coloc** — gestion budgétaire perso + colocation.
Tout le code de prod vit dans `budget-app/`. Pas de cloud — données sur clé USB LUKS (option) ou `/data` HA standard.

## État actuel : 0.10.0 (mai 2026)

L'app est **en production** sur la HA Green de l'utilisateur. Image publiée via GHA Docker sur `ghcr.io/dustprogram/budget-multi-coloc-{arch}`. Tests : 49/49 pytest verts. Frontend build : OK.

### Phases livrées

- ✅ **0.4.x** : Foundation + multi-user (account_members, charge_splits, min-cash-flow)
- ✅ **0.5.x** : Design Handoff, mobile responsive, vues mensuelle/annuelle, calendrier, événements custom, valid_from/valid_to
- ✅ **0.6.x** : Chat IA Claude function calling, Import vision (tickets/factures/relevés)
- ✅ **0.7.0** : Bulk import Excel/CSV 100% local
- ✅ **0.8.x** : LLM pluggable 14 providers, suppression compte avec cascade/reassign, rate-limit RPM/TPM/RPD, UI Settings LLM, version dynamique
- ✅ **0.9.x** : Modèle abondement **avec injection d'événements virtuels** (cf [[project-coloc-abondement-model]]), portée calendrier 1-3 ans, transitions revenu/charge (`/transition` endpoints), `created_at` comme `valid_from` implicite, toggle "exclure ma part des charges joint" du budget perso, virements perso→joint déduits de la marge
- ✅ **0.10.0** : Cache mémoire 30s sur `compute_monthly_budget` avec invalidation auto via listener SQLAlchemy, yearly batch pré-warming, endpoint `/dashboard/balance_at`

### Phase à venir

- ⏳ Chat vocal via HA Assist intents (gratuit, local possible)
- ⏳ **Sécurité Internet** : si l'user veut exposer hors LAN, faut faire rate-limit login externe + lockout + headers HSTS/X-Frame + cookies secure + audit log. Cf [[project-security-audit-pending]].

### Refonte coloc **actuelle** (0.9.1+) — IMPORTANT

Le modèle a évolué :
- Une charge sur joint partagé est une **vraie dépense** : -800€ sortent du joint au jour J
- Pour chaque `ChargeSplit`, on **génère un événement virtuel `expected_in`** entrant sur le joint le même jour, montant = part du membre
- Net = 0 : le solde projeté reste équilibré même si les colocs n'utilisent pas l'app
- Détails : `services/joint_contributions.py` (calcul réel vs attendu) + `api/calendar.py` (injection des `expected_in`)
- Sur le **perso de l'utilisateur** : un toggle `Settings.exclude_joint_charges_from_personal` permet d'exclure sa part théorique de `total_charges` ; quand activé, les virements perso→joint (RecurringTransfer/OneTimeTransfer) sont déduits de `available_for_purchases` à la place

⚠️ **Ne pas neutraliser les charges joint** comme je l'avais fait en 0.9.0 (revert dans 0.9.1) — cf [[project-coloc-abondement-model]].

## Architecture

### Backend (`budget-app/backend/`)
- Python 3.12, FastAPI, SQLAlchemy 2.0, SQLite WAL sur `/data/budget.db` (PRAGMAs eMMC-friendly)
- Pas d'Alembic — `Base.metadata.create_all` idempotent + `_migrate_add_column_if_missing` pour les migrations légères
- Décimaux : `Decimal` toujours. Dates : `date` / `datetime`

#### Services IA
- `services/llm_client.py` : factory `get_llm_client()` + 3 adapters (Anthropic, OpenAI-compat, Gemini), 14 providers en presets
- `services/ai_chat.py`, `services/ai_tools.py` : chat function calling
- `services/ai_import.py` : Claude Vision (tickets/factures/relevés)
- `services/bulk_import.py` : Excel/CSV multi-sheets, **100% local**
- `services/budget_cache.py` (0.10.0) : cache 30s sur `compute_monthly_budget` + listener SQLAlchemy auto-invalidation

#### Calcul budget
- `services/budget_calc.py:compute_monthly_budget` : wrapper avec cache 30s
- `_compute_monthly_budget_uncached` : le vrai calcul
- `compute_yearly_overview` : pré-warming SQLAlchemy identity_map + 12× compute_monthly_budget (cache hit dès le 2e appel)
- `_in_validity_window` : utilise `valid_from` ou `created_at` comme fallback (depuis 0.9.5)
- `services/joint_contributions.py` : calcul attendu vs réel pour la page Coloc
- Endpoint `/api/dashboard/balance_at?year=Y&month=M` (0.10.0) : solde cumulé au début d'un mois, évite 4× /yearly côté frontend

### Frontend (`budget-app/frontend/`)
- React 18 + TS strict + Vite (PWA)
- React Query + axios avec préfixe ingress auto
- Pages clés : `Chat.tsx`, `Import.tsx`, `BulkImport.tsx`, `ColocSummary.tsx` (abondements), `Events.tsx`, `MonthlyView.tsx` (Flux/Solde, balance_at endpoint), `Accounts.tsx` (cascade/reassign), `Calendar.tsx` (drag-drop, sélecteur portée 3 mois → 3 ans)
- Hook `lib/useAutoEdit.ts` : détecte `?edit=N` et auto-ouvre modal
- `react-markdown` + `remark-gfm` pour les bulles Chat assistant

### Sécurité (état actuel)
- Auth via middleware HA Ingress (`X-Remote-User-Id`)
- Port externe `8765` désactivé par défaut, auth username/password + bcrypt + cookies HMAC
- SQL injection → SQLAlchemy ORM (sain)
- XSS → React + react-markdown sanitize (sain)
- ⚠️ **Pas de rate-limit sur le login externe** — si exposition Internet, à faire urgemment

## Configuration LLM (`config.yaml` HA add-on)

```yaml
llm_provider: ""              # anthropic | openai | gemini | mistral | groq | openrouter | deepseek | together | perplexity | fireworks | cerebras | ollama | lmstudio | custom
llm_api_key: ""               # vide OK pour ollama/lmstudio
llm_model: ""                 # vide = défaut du preset
llm_base_url: ""              # vide = preset auto
llm_rpm_limit: 0              # 0 = illimité
llm_tpm_limit: 0
llm_rpd_limit: 0
claude_api_key: ""            # compat ascendante seulement
```

Override possible **in-app** via Réglages > Provider LLM (table `Settings`, prime sur le yaml).

## Conventions

### Versioning
- Pas de suffixes beta/rc/alpha. Bump direct dans config.yaml (cf [[feedback-versioning-no-beta]])

### Git workflow
- Branches `feat/<theme>` ou `fix/<theme>`, merge sur main avec `--no-ff` puis push (cf [[feedback-merge-direct-on-main]])
- Push sur main = GHA build qui publie l'image ghcr.io

### Style de code
- Pas de commentaires verbeux. Seulement le WHY non évident.
- Pas d'abstractions prématurées.

### UI/UX
- "L'IA" dans les messages, jamais le nom du provider en dur
- Bulles user en `var(--terra)`, assistant en `var(--bg-2)`
- `100dvh` (pas `100vh`) pour gérer la barre URL mobile
- Modales ancrées flex-start sur mobile (clavier ouvert)

## Commandes utiles

```bash
# Dev backend (DEV_MODE bypass auth, user de test "Dev User")
cd budget-app/backend
DEV_MODE=true LLM_API_KEY=... DATABASE_URL="sqlite:///./dev.db?check_same_thread=False" \
  .venv/bin/python -m uvicorn main:app --reload --port 8000

# Dev frontend
cd budget-app/frontend && npm run dev

# Tests backend (49 actuellement)
cd budget-app/backend && DEV_MODE=true DATABASE_URL="sqlite:///./test.db" .venv/bin/pytest tests/ -q

# Build frontend
cd budget-app/frontend && npm run build
```

## Setup dev (une seule fois)

```bash
brew install python@3.12
cd budget-app/backend
/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt pytest pytest-asyncio httpx
cd budget-app/frontend && npm install
```

## Tips importants

- **Toujours filtrer par `user_id`** sauf `shopping` et `coloc` (partagés)
- **WAL mode SQLite crucial** pour l'eMMC HA Green
- **Le scénario `test_scenario_validated_excel.py` doit toujours passer**
- **Récupérer un fichier ancien** : `git show <sha>:<path>`
- **Suppression d'un compte** : modal `DeleteAccountModal` avec cascade ou reassign
- **Rate-limit LLM** : `check_rate_limits(db)` avant + `record_usage` après chaque appel
- **Cache budget** : invalidation auto via listener SQLAlchemy, mais on peut appeler `budget_cache.invalidate_all()` manuellement si besoin

## Code à NE PAS toucher / Pièges

- **`services/coloc_split.py` + `ColocBreakdown.debts`** : legacy de l'ancien modèle min-cash-flow. Plus utilisé par la page Coloc mais l'endpoint `/coloc/breakdown` existe encore. À virer en cleanup futur, mais ne pas réactiver le min-cash-flow.
- **`_backfill_created_at_if_null()` dans `models/base.py`** : migration one-shot 0.9.6 à RETIRER en 0.9.7+ (idempotent mais coût SQL inutile une fois fait).
- **`SettleBadge`, `ChargeSplit.settled_at`** : legacy, ne plus utiliser dans les nouvelles features.
