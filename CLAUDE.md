# 🤖 Guide pour Claude Code

Add-on Home Assistant **Budget Multi-Coloc** — gestion budgétaire perso + colocation.
Tout le code de prod vit dans `budget-app/`. Pas de cloud — données sur clé USB LUKS (option) ou `/data` HA standard.

## État actuel : 0.8.4 (mai 2026)

L'app est **en production** sur la HA Green de l'utilisateur, image publiée via GHA Docker sur `ghcr.io/dustprogram/budget-multi-coloc-{arch}`. Tests : 49/49 pytest verts. Frontend build : OK.

### Phases livrées

- ✅ **0.4.x** : Foundation + multi-user (account_members, charge_splits avec settled_at, min-cash-flow)
- ✅ **0.5.x** : Design Handoff (palette terra/sage/plum), mobile responsive, vue mensuelle/annuelle, calendrier, événements custom, dates de validité (valid_from/valid_to)
- ✅ **0.6.0** : Chat IA Claude function calling (11 outils : add_purchase/charge/income/shopping, list_*, get_dashboard, mark/delete_shopping). Confirmation pour montants ≥ 50€ et tous les revenus. Undo persistant.
- ✅ **0.6.1** : Import vision (tickets, factures, relevés) — Claude Vision, ImportBatch pour undo, dédup par signature
- ✅ **0.7.0** : Bulk import Excel/CSV 100% local — template multi-sheets, parsing, validation par ligne, résolution manuelle des ambigus
- ✅ **0.8.0** : LLM pluggable — Anthropic/OpenAI-compatible/Gemini via adapter pattern
- ✅ **0.8.1** : Suppression compte avec dépendances + cascade ou réassignation
- ✅ **0.8.2** : Rate-limit local RPM/TPM/RPD + affichage usage en temps réel
- ✅ **0.8.3** : 14 providers LLM en presets (Mistral, Groq, OpenRouter, DeepSeek, Together, Perplexity, Fireworks, Cerebras, Ollama, LM Studio, …)
- ✅ **0.8.4** : Chat UI polish — container scroll interne, bulle utilisateur optimiste, typing bubble animée

### Refonte coloc majeure (0.7.0)

Modèle **abondement** au lieu de "qui doit qui" :
- Une charge sur un compte joint est payée par le **compte joint lui-même** (organisme externe destinataire), pas par un user. `Charge.payer_user_id = None` dans ce cas.
- Chaque membre **abonde** le joint via virement de sa part.
- Service `services/joint_contributions.py` calcule par membre/mois : `expected` (somme ChargeSplit) vs `actual` (virements entrants) → balance.
- Page Coloc montre une carte par compte joint avec table membres/attendu/versé/solde (rouge = retard).
- **Pas de "Flux de remboursement" ni de settle** — c'est l'ancien modèle, retiré en 0.5.7.
- Nouveau `SplitMode.PAR_UTILISATEUR` : chaque membre a son propre montant configurable (saisie au cas par cas dans la modal Charge via `splits_override`).

### Phase à venir

- ⏳ Chat vocal via HA Assist intents (gratuit, local possible)

## Architecture

### Backend (`budget-app/backend/`)
- Python 3.12, FastAPI, SQLAlchemy 2.0, SQLite WAL sur `/data/budget.db` (PRAGMAs eMMC-friendly dans `models/base.py`)
- Pas d'Alembic — `Base.metadata.create_all` idempotent + helper `_migrate_add_column_if_missing` pour les migrations légères
- Pattern endpoints : voir `api/charges.py` ou `api/accounts.py` comme référence
- Décimaux : toujours `Decimal`, jamais `float`. Dates : `date` pour dates, `datetime` pour timestamps

#### Services IA
- `services/llm_client.py` : interface unifiée `LLMClient` + factory `get_llm_client()`. 3 adapters (`AnthropicAdapter`, `OpenAIAdapter`, `GeminiAdapter`) avec 14 providers en presets (`PROVIDER_PRESETS`). Format pivot = blocks Anthropic-style.
- `services/ai_chat.py` : boucle chat avec function calling, max 6 itérations. Stocke conversations en DB (`ChatConversation`/`ChatMessage`/`ChatAction`).
- `services/ai_tools.py` : 11 outils exposés au LLM. `requires_confirmation()` = True si montant ≥ 50€ ou `add_income`.
- `services/ai_import.py` : Claude Vision pour tickets/factures/relevés, dédup par signature `(date, amount, marchand)`.
- `services/bulk_import.py` : Excel/CSV multi-sheets, validation locale, résolution manuelle des ambigus, pas d'IA.
- **Rate-limiting** : `check_rate_limits(db)` avant chaque appel LLM, `record_usage(db, user_id, response)` après. Table `LLMUsage` trace tokens in/out par appel.

### Frontend (`budget-app/frontend/`)
- React 18 + TS strict + Vite (PWA via `vite-plugin-pwa`)
- React Query (pas Redux). Axios avec préfixe ingress auto (`lib/api.ts`)
- Lucide pour icônes, Recharts + composants SVG custom (BalanceCurve, Donut, Sparkline, YearChart)
- Pages clés : `Chat.tsx` (assistant), `Import.tsx` (vision), `BulkImport.tsx` (Excel), `ColocSummary.tsx` (abondements), `Events.tsx` (timeline), `MonthlyView.tsx` (toggle Flux/Solde), `Accounts.tsx` (avec modal suppression cascade/reassign)
- Hook `lib/useAutoEdit.ts` : détecte `?edit=N` et auto-ouvre la modal d'édition. Utilisé pour le bouton "Modifier" inter-pages depuis Events.

### Sécurité
- Auth via middleware HA Ingress : `services/auth.py` lit `X-Remote-User-Id` et injecte `request.state.user`
- Pas de JWT/session pour l'ingress — HA tranche
- Port externe `8765` ouvert pour `courses` et `coloc-summary` uniquement (config dans `EXTERNAL_MODULES`). Authentification username+password+bcrypt via `services/external_auth.py` + cookies HMAC.

### Données partagées vs perso
- **Filtrage par `user_id`** par défaut (incomes, charges, transfers, savings, purchases). Helper `accessible_account_ids(db, user_id)` retourne IDs visibles (own + AccountMember).
- **Ressources partagées** sans filtrage : `shopping`, `coloc`
- Sur compte joint + mode partagé : `Charge.payer_user_id` est `None` (vue depuis l'API). Co-titulaires peuvent éditer toute charge du compte (pas seulement les leurs).
- Filtre **"perso"** dans MonthlyView/Simulator = comptes solo (`type !== 'Compte joint'`), pas juste `space === 'perso'`. Un compte joint que j'ai créé n'est pas perso.

## Configuration LLM (`config.yaml`)

```yaml
llm_provider: ""              # anthropic | openai | gemini | mistral | groq | openrouter | deepseek | together | perplexity | fireworks | cerebras | ollama | lmstudio | custom
llm_api_key: ""               # clé du provider (vide OK pour ollama/lmstudio)
llm_model: ""                 # vide = défaut du preset
llm_base_url: ""              # vide = preset auto (URL câblée par preset)
llm_rpm_limit: 0              # 0 = illimité
llm_tpm_limit: 0
llm_rpd_limit: 0
claude_api_key: ""            # compat ascendante seulement
```

Présets dans `services/llm_client.py:PROVIDER_PRESETS`. L'endpoint `GET /api/chat/providers` les liste pour l'UI.

## Conventions importantes

### Versioning
- Pas de suffixe `beta` — l'utilisateur préfère des versions simples (`0.5.6`, pas `0.6.0-beta1`). Bump direct dans `config.yaml` à chaque release.
- Une `0.X.Y` = livraison stable. Patches (0.6.1 = SDK fix) suivent immédiatement les features (0.6.0).

### Git workflow
- Branches feature : `feat/<theme>` ou `fix/<theme>`. Pas de PR (l'utilisateur préfère merger directement sur main une fois validé localement).
- Toujours `git merge --no-ff` pour garder la trace de la branche dans l'historique main.
- Pas de force push, pas de squash sans demande explicite.
- Push sur main = déclenche `build.yml` GHA qui publie l'image sur `ghcr.io/dustprogram/budget-multi-coloc-{arch}`.

### Style de code
- Pas de commentaires verbeux. Le code se documente avec des noms clairs. Commentaire = seulement pour le WHY non évident (incident passé, invariant subtle).
- Pas de docstrings multi-paragraphes — une ligne max sur les fonctions internes.
- Pas d'abstractions prématurées. 3 lignes similaires < une abstraction.

### UI/UX
- **"L'IA"** dans les messages, jamais le nom du provider en dur ("Claude réfléchit" → "L'IA réfléchit"). Le provider exact est dans l'eyebrow de la page Chat.
- Bulles user en `var(--terra)` (orange), bulles assistant en `var(--bg-2)` (gris clair).
- Animations subtiles : transitions sur hover, scale au focus, typing dots pulsation 1.2s.
- Mobile : `100dvh` (pas `100vh`) pour gérer la barre URL. Modales ancrées en haut sur mobile pour rester accessibles clavier ouvert.

## Commandes utiles

```bash
# Dev backend (DEV_MODE bypass l'auth ingress, user de test "Dev User")
cd budget-app/backend
DEV_MODE=true LLM_API_KEY=... DATABASE_URL="sqlite:///./dev.db?check_same_thread=False" \
  .venv/bin/python -m uvicorn main:app --reload --port 8000

# Dev frontend
cd budget-app/frontend && npm run dev

# Tests backend (49 actuellement)
cd budget-app/backend && DEV_MODE=true DATABASE_URL="sqlite:///./test.db" .venv/bin/pytest tests/ -q

# Build frontend
cd budget-app/frontend && npm run build

# Voir le détail d'un build GHA
# https://github.com/DustProgram/budget-multi-coloc/actions
```

## Setup dev (une seule fois)

```bash
# Backend — Python 3.12 via Homebrew
brew install python@3.12
cd budget-app/backend
/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt pytest pytest-asyncio httpx

# Frontend
cd budget-app/frontend && npm install
```

## Tips importants

- **Toujours filtrer par `user_id`** sauf `shopping` et `coloc` qui sont partagés
- **WAL mode SQLite est crucial** pour l'eMMC HA Green (déjà dans `models/base.py`)
- **Le scénario `test_scenario_validated_excel.py` doit toujours passer** — régression de référence
- **Récupérer un fichier ancien** : `git show <sha>:<path> > /tmp/...`
- **GHA build trigger** : push sur `main` uniquement (pas sur les branches). Pour tester avant merge → tester en local avec le DEV_MODE.
- **Suppression d'un compte** : passer par `GET /accounts/{id}/dependencies` puis `DELETE` avec `?cascade=true` ou `?reassign_to=<id>`. La modal frontend `DeleteAccountModal` gère ça.
- **Rate-limit côté app vs côté provider** : si l'user n'a rien configuré (`llm_*_limit: 0`), c'est le provider qui renvoie 429. Le frontend affiche l'erreur via l'ErrorBox.
