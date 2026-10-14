# 🤖 Guide pour Claude Code

**Budget Multi-Coloc** — gestion budgétaire perso + colocation.
Tout le code de prod vit dans `budget-app/`. Depuis 0.12.0, cible principale = **VPS Hostinger KVM 1**
en mode `AUTH_MODE=standalone` (cf `deploy/README.md`). L'add-on Home Assistant reste fonctionnel mais est mis de côté.

---

## ⚡ État actuel : 0.12.0 (octobre 2026)

Passage en **standalone sur VPS** : `deploy/` (docker-compose app + Caddy HTTPS), `budget-app/Dockerfile.standalone`,
image `ghcr.io/dustprogram/budget-multi-coloc-standalone` (workflow `build-standalone.yml`).
Image HA toujours publiée sur `ghcr.io/dustprogram/budget-multi-coloc-{arch}`. Tests : **105/105 pytest verts**. `pip-audit` en CI.
Rapprochement relevés ↔ déclarations + page « À valider » + API agent Hermes/n8n livrés dans la même version → `docs/AUTOMATISATIONS.md`.
Reste : synchro bancaire directe (agrégateur DSP2).

### Comment reprendre

1. `cd /Users/nathanramedace/budget-multi-coloc`
2. `git status` → working tree clean attendu
3. `git log --oneline -5` → vérifier qu'on est à jour
4. Lire les tâches pending (cf section "Tâches restantes" ci-dessous)
5. Pour le dev backend :
   ```bash
   cd budget-app/backend
   DEV_MODE=true LLM_API_KEY=... DATABASE_URL="sqlite:///./dev.db?check_same_thread=False" \
     .venv/bin/python -m uvicorn main:app --reload --port 8000
   ```
6. Pour le dev frontend : `cd budget-app/frontend && npm run dev`

---

## 📜 Phases livrées (chronologique)

- ✅ **0.4.x** : Foundation + multi-user (account_members, charge_splits, min-cash-flow — virés depuis)
- ✅ **0.5.x** : Design Handoff (palette terra/sage/plum), mobile responsive, vues mensuelle/annuelle, calendrier, événements custom, validity windows
- ✅ **0.6.x** : Chat IA Claude function calling (11 outils), Import vision (Claude Vision, tickets/factures/relevés), ImportBatch + undo
- ✅ **0.7.0** : Bulk import Excel/CSV 100% local — template multi-sheets, validation par ligne, résolution manuelle
- ✅ **0.8.x** : LLM pluggable 14 providers (anthropic/openai/gemini/mistral/groq/openrouter/deepseek/together/perplexity/fireworks/cerebras/ollama/lmstudio/custom), rate-limit RPM/TPM/RPD, UI Settings LLM in-app, version dynamique, suppression compte cascade/reassign, modal/inputs UX
- ✅ **0.9.x** : Modèle abondement V2 (charges joint = vraies dépenses + events virtuels `expected_in` qui équilibrent), portée calendrier 1-3 ans, transitions revenu/charge (`/transition` endpoints), `created_at` comme `valid_from` implicite, toggle "exclure ma part des charges joint" du budget perso, virements perso→joint déduits de la marge
- ✅ **0.10.0** : Cache mémoire 30s sur `compute_monthly_budget` + listener SQLAlchemy auto-invalidation, yearly batch pré-warming, endpoint `/dashboard/balance_at`
- ✅ **0.12.0** : Mode standalone (sans HA) pour VPS : comptes locaux + admin UI, fixes sécu #56 (rate-limit, lockout, anti-spoofing, headers, cookies, limite payload), docker-compose + Caddy, backups quotidiens. Relevés bancaires (CSV/OFX/PDF) + rapprochement automatique + règles apprises + page « À valider » + abondements coloc réels + API agent (Hermes, n8n) + liaison messageries par code
- ✅ **0.11.0** : Cleanup types legacy coloc frontend, backfill `_backfill_created_at_if_null` retiré, widget alerte retard abondement Dashboard, export CSV/PDF par mois, budgets catégorie avec plafonds mensuels

---

## 🎯 Tâches restantes (pending dans le système de tâches)

### #53 — Chat vocal via HA Assist intents
- Statut : **pending**, jamais commencé.
- Objectif : exposer les outils du chat IA comme HA intents pour qu'ils soient invocables depuis HA Assist. L'audio est géré par HA Assist (pipeline configuré côté user, 100% local possible). Le backend reçoit du texte transcrit, idem function calling actuel.
- Effort estimé : 3-4h.
- Approche : créer endpoint `/api/intents/{intent_name}` qui mappe aux mêmes tools que `ai_tools.py`, déclarer un fichier d'intents HA dans `config.yaml`.

### #56 — Fixes sécurité avant exposition Internet
- Statut : **✅ livré en 0.12.0** (actif en `AUTH_MODE=standalone`, cf `services/security.py`). Reste : table `LoginLog` (idée #5), révocation serveur des sessions.
- Historique :
- L'utilisateur a décidé d'attendre. **Avant toute exposition hors LAN**, faire d'urgence :
  1. **Rate-limit login externe** sur `services/external_auth.py` (5 essais/min/IP)
  2. **Lockout après N échecs** (15min après 10 échecs)
  3. **Refuser `X-Remote-User-Id` sur le port externe** (anti-spoofing)
  4. **Headers HTTP sécurité** : HSTS, X-Frame-Options, CSP, X-Content-Type-Options
  5. **Cookies `httpOnly` + `secure` + `SameSite=Strict`** sur le port externe
  6. **Limite payload 10MB** (`BaseHTTPMiddleware` Starlette)
- Recommandation à rappeler : **Nabu Casa Remote** ou **Tailscale** sont plus safe (zéro modif app, passe par l'ingress HA).
- Effort estimé : 3-4h.

---

## 💡 Idées émises pendant l'audit non transformées en tâches

À considérer si on cherche du polish ou des features bonus :

1. **Drilldown patrimoine par compte sur YearlyView**
   - Aujourd'hui le heatmap Patrimoine est global. Permettre de cliquer un compte (ex: Livret A) et voir son évolution mensuelle sur 12 mois.
   - Effort : ~1h

2. **Catégorisation détaillée des achats (référentiel vs string libre)**
   - `Purchase.category` est une string libre. Risque : "Restos", "Restau", "Restaurant" sont 3 catégories différentes.
   - Solution : autocomplete sur le champ + soft-suggestion des catégories existantes. Ou enum stricte avec catégories définies par l'utilisateur (déjà partiellement via `Settings.categories`).
   - Lié à #58 (déjà livré) : si on standardise, les budgets catégorie deviennent plus fiables.
   - Effort : 1-2h

3. **LLMUsage purge automatique (>30j)**
   - La table grossit avec le temps. Pour usage perso c'est négligeable, mais à 1000+ rows la query `usage_window` ralentit.
   - Job APScheduler quotidien qui supprime les rows > 30j. Ou DELETE au démarrage.
   - Effort : 15 min

4. **`pip-audit` en CI**
   - Pas d'audit auto des CVE deps actuellement.
   - Ajouter dans `.github/workflows/test.yml` : `pip-audit -r requirements.txt` après les tests.
   - Effort : 15 min

5. **Logs d'audit sécu (`LoginLog` table)**
   - Aujourd'hui les tentatives de login externe ne sont pas tracées. Impossible de détecter une attaque.
   - Nouvelle table `LoginLog(id, timestamp, ip, username, success, user_agent)`.
   - Lié à #56 (fixes sécurité). À faire en même temps.
   - Effort : 1h

6. **Optim cache externe Redis** (si multi-worker uvicorn un jour)
   - Le cache `services/budget_cache.py` est par-process. Sur HA on a 1 worker → OK. Si on passe à plusieurs workers, faut Redis ou similaire.
   - Aucune action requise actuellement. À garder en tête.

7. **Cleanup endpoint `/coloc/breakdown`**
   - L'endpoint existe encore (utilisé en interne par `/coloc/pdf`) mais sa réponse contient `data.debts` (min-cash-flow legacy) que personne ne consomme côté frontend.
   - Soit virer l'endpoint et réécrire `/coloc/pdf` sur le nouveau modèle (joint_contributions).
   - Soit simplifier la réponse pour ne plus exposer `data.debts`.
   - Effort : 30 min

---

## 🏗 Architecture

### Backend (`budget-app/backend/`)
- Python 3.12, FastAPI, SQLAlchemy 2.0, SQLite WAL sur `/data/budget.db` (PRAGMAs eMMC-friendly dans `models/base.py`)
- Pas d'Alembic — `Base.metadata.create_all` idempotent + `_migrate_add_column_if_missing` pour les migrations légères
- Décimaux : `Decimal` toujours. Dates : `date` / `datetime`

#### Services IA (mémoire détaillée : `project_llm_pluggable.md`)
- `services/llm_client.py` : factory `get_llm_client()` + 3 adapters (Anthropic, OpenAI-compat, Gemini), 14 providers en presets
- Mistral : appels espacés ≥1,1 s (offre gratuite ≈ 1 req/s) + 5 relances SDK sur 429, `_mistral_compat` (ids d'outil 9 car., `name` sur les messages tool, assistant inséré entre tool et user). `POST /api/settings/llm/test` (admin) = vrai appel avec les outils, renvoie l'erreur exacte ; `env_overrides` signale les `LLM_*` du .env qui priment sur l'UI
- `services/ai_chat.py` + `services/ai_tools.py` : chat function calling, 11 outils
- `services/ai_import.py` : Claude Vision (tickets/factures/relevés)
- `services/bulk_import.py` : Excel/CSV multi-sheets, **100% local**
- `services/budget_cache.py` (0.10.0) : cache 30s + listener SQLAlchemy auto-invalidation

#### Calcul budget (mémoire détaillée : `project_perf_caching.md`, `project_coloc_abondement_model.md`)
- `services/budget_calc.py:compute_monthly_budget` : wrapper avec cache 30s
- `_compute_monthly_budget_uncached` : le vrai calcul (charges joint partagées : total sort + somme(ChargeSplit) entre via `transfers_net`)
- `compute_yearly_overview` : pré-warming SQLAlchemy identity_map + 12× compute_monthly_budget (cache hit dès le 2e appel)
- `_in_validity_window` : utilise `valid_from` ou `created_at` comme fallback (depuis 0.9.5)
- `services/joint_contributions.py` : calcul attendu vs réel pour la page Coloc + widget alerte Dashboard
- Endpoint `/api/dashboard/balance_at?year=Y&month=M` (0.10.0) : solde cumulé au début d'un mois
- Endpoint `/api/dashboard/coloc_alerts?year=Y&month=M` (0.11.0) : retards d'abondement actifs

#### Export & catégorisation (0.11.0)
- `api/export.py` : `/api/export/csv` et `/api/export/pdf` — toutes transactions du mois en sortie, reportlab pour le PDF
- `api/category_budgets.py` + modèle `CategoryBudget` : plafonds mensuels par catégorie d'achat, agrège `Purchase.category`

### Frontend (`budget-app/frontend/`)
- React 18 + TS strict + Vite (PWA via `vite-plugin-pwa`)
- React Query + axios avec préfixe ingress auto
- Lucide pour icônes
- `react-markdown` + `remark-gfm` pour les bulles Chat assistant (chunk séparé ~50KB gzip)
- Pages clés :
  - `Dashboard.tsx` : widget `<ColocAlertsBanner>` + `<ExportButtons>` (0.11.0)
  - `Chat.tsx` : container fixed height, optimistic user bubble, typing animation
  - `Import.tsx` (Claude Vision) + `BulkImport.tsx` (Excel/CSV)
  - `ColocSummary.tsx` : abondements par compte joint
  - `Events.tsx` : timeline + Modifier inter-pages via `?edit=N`
  - `MonthlyView.tsx` : toggle Flux/Solde, fetch `/balance_at` pour cumul cross-année
  - `YearlyView.tsx` : heatmap, filtres, métrique Patrimoine cumulé
  - `Accounts.tsx` : modal `DeleteAccountModal` avec cascade/reassign
  - `Calendar.tsx` : drag-drop, sélecteur portée 3 mois → 3 ans, bouton Modifier
  - `Settings.tsx` : `<CategoryBudgetsCard>` (0.11.0) + `<LLMSettingsCard>` (admin only)
- Hook `lib/useAutoEdit.ts` : détecte `?edit=N` et auto-ouvre modal

### Relevés & rapprochement (0.12.0)
- `BankTransaction` (dédup par `fingerprint` unique par compte), `MatchingRule` (tokens du libellé normalisé ⊂ libellé + fourchette montant), `ChannelLink`, `User.notify_channel`
- Import en masse : `account_id` optionnel sur `/api/bank/import` et `/api/agent/statements` → compte reconnu par `Account.statement_ref` (n° de compte à 11 car. tiré de l'IBAN FR à clé valide, `<ACCTID>` OFX, « compte » + 11 chiffres en CSV), appris au premier import avec compte choisi (`services/account_detect.py`). Inconnu → 422 `code: account_unknown`
- Ordre : achat existant ±4j → règle → déclarations du mois (1 seul candidat = auto, sinon `to_review`)
- `joint_contributions` : si le relevé du joint est importé pour le mois, `actual` = crédits rapprochés à un membre (`from_bank=True`)
- `/api/agent/*` : auth `AGENT_API_TOKEN` (hors middleware session), identité par `channel`+`handle` liés via code (in-memory 15 min) ou `username` (n8n)
- Le SW cache `/api` GET en **NetworkFirst** (était StaleWhileRevalidate → listes pas à jour après mutation)

### Relevés PDF & démarrage rapide (0.12.0)
- `services/pdf_statements.py` : lecture **locale** des PDF à colonnes Débit/Crédit (BRED, BoursoBank, Sumeria : montants `1234.56`, dates `jj/mm`, colonne Solde courant ignorée, soldes « confirmés » hors tableau) via pdfminer (position X des montants vs en-têtes), arrêt à « Nouveau solde » / « poste annexe », **vérifiée** par ancien solde + mouvements = nouveau solde. IA seulement si non vérifié (`source = "pdf-ia"`)
- `services/onboarding.py` : groupes par commerçant (libellé sans CARTE/PRLV/VIR…) → revenus réguliers (≥2 mois), charges (prélèvements/virements programmés ≥2 mois ; carte seulement si abonnement connu ou ≥10 €, 1×/mois), crédits d'un membre sur compte joint (prénom dans le libellé) → abondement, virements vers soi (nom complet) → ignorer, reste → achats catégorisés (mots-clés puis 1 appel IA optionnel)
- `GET /api/bank/onboarding`, `POST /api/bank/onboarding/apply` ; UI « Démarrage rapide » dans `Inbox.tsx` (≥5 opérations à trier)
- ⚠️ Ne jamais committer de vrais relevés : tests sur PDF générés (reportlab) au même format

### Enveloppes vie quotidienne (0.12.0) — philosophie de l'app
- **On ne détaille pas les petites dépenses** : l'objectif est « combien il reste à la fin » et « puis-je me permettre cet achat ».
- `Envelope` : perso (`user_id`, `account_id` nul) ou commune (`account_id` = compte joint, partagée à parts égales, ajoutée à l'abondement attendu de chaque membre). `monthly_amount` + `big_purchase_threshold` (seuil choisi par l'user, défaut 150 €)
- Import : débit sans déclaration correspondante et < seuil → `match_kind = "daily"` sans question ; ≥ seuil → « à valider » (achat exceptionnel ou quotidien ?). Sans enveloppe configurée, rien n'est auto-classé quotidien
- `MonthlyBudget.available_for_purchases` = **marge projets** = revenus − charges − épargne − achats − enveloppe perso − part de l'enveloppe commune (`envelope_perso`, `envelope_common_share`)
- `GET /api/envelopes/` (statut du mois : dépensé, reste, €/jour, suggestion = moyenne des petites dépenses importées), `PUT /api/envelopes/perso`, `PUT /api/envelopes/account/{id}` ; UI `components/EnvelopesCard.tsx` sur le Dashboard
- Démarrage rapide : toutes les petites dépenses d'un compte = **un seul groupe « daily »**

### Second facteur & sessions (0.12.0)
- Deux façons de se connecter : **mot de passe + second facteur** (code TOTP d'une appli, `pyotp`, ou passkey, ou code de secours) **ou passkey seule** (WebAuthn discoverable, `user_verification=required`, `/api/auth/login/passkey/start` + `/finish`)
- `/api/auth/login/password` renvoie `mfa_required` + `methods` (`totp`/`passkey`/`recovery`), puis `/login/totp`, `/login/passkey` ou `/login/recovery`. État intermédiaire : cookie `budget_mfa` signé (path `/api/auth/login`, 5 min) + état en mémoire (`services/passkeys.py`). Un code TOTP faux ne consomme pas l'étape (rate-limit + lockout bornent) ; anti-rejeu via `User.totp_last_step`
- TOTP : `User.totp_secret/totp_enabled/totp_last_step`, `POST /api/passkeys/totp/setup` (QR SVG via `segno`), `/totp/enable`, `/totp/disable` (code requis)
- RP ID = `WEBAUTHN_RP_ID` ou `DOMAIN` (jamais le Host reçu) ; en dev = host de la requête
- `User.session_version` dans le cookie (`sv`) : bump = révocation (mdp changé, 1re passkey, suppression passkey, `logout-all`, reset admin) ; la session courante est réémise
- CLI : `create_user.py <u> --reset-2fa`

### Mode standalone (0.12.0)
- `AUTH_MODE=standalone` : header `X-Remote-User-Id` ignoré, tokens legacy (`?token=` et Bearer) refusés, Swagger off, headers sécu + HSTS, cookies Secure/Strict
- Users locaux : `ha_user_id = "local:<username>"` + `ExternalCredential` (`services/local_users.py`). 1er admin via `ADMIN_USERNAME`/`ADMIN_PASSWORD` si base vide
- Admin : `GET/POST /api/users/`, `PATCH /api/users/{id}` ; CLI `scripts/create_user.py`
- Une session `coloc` ne peut ni s'auto-promouvoir `full` ni générer de token legacy

### Sécurité (état actuel, cf `project_security_audit_pending.md`)
- ✅ Auth via middleware HA Ingress (`X-Remote-User-Id`)
- ✅ Port externe `8765` désactivé par défaut, auth username/password + bcrypt + cookies HMAC
- ✅ SQL Injection → SQLAlchemy ORM (sain)
- ✅ XSS → React + react-markdown sanitize (sain)
- ✅ CORS → DEV_MODE only (sain)
- ✅ Rate-limit login 5/min/IP + lockout 15 min après 10 échecs (in-memory, 1 worker)

---

## ⚙️ Configuration LLM (`config.yaml` HA add-on)

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

Override possible **in-app** via Réglages → "Provider LLM" (table `Settings`, prime sur le yaml).

---

## 📐 Conventions

### Versioning
- **Pas de suffixes `beta`/`rc`/`alpha`**. Bump direct dans `config.yaml` à chaque release (cf `feedback_versioning_no_beta.md`).

### Git workflow
- Branches `feat/<theme>` ou `fix/<theme>`, merge sur main avec `git merge --no-ff` puis push (cf `feedback_merge_direct_on_main.md`)
- Push sur main = GHA build qui publie l'image `ghcr.io`
- **Jamais d'amend sur un commit pushé** (force-push interdit)

### Style de code
- Pas de commentaires verbeux. Seulement le WHY non évident.
- Pas d'abstractions prématurées (3 lignes similaires < une mauvaise abstraction)
- Pas de docstrings multi-paragraphes

### UI/UX
- "**L'IA**" dans les messages, jamais le nom du provider en dur ("Claude réfléchit" → "L'IA réfléchit")
- Bulles user en `var(--terra)`, assistant en `var(--bg-2)`
- `100dvh` (pas `100vh`) pour gérer la barre URL mobile
- Modales ancrées flex-start sur mobile (clavier ouvert)
- Shake CSS + vibration au clic outside d'une modale (ne ferme pas, alerte le user d'utiliser Annuler)

---

## 🚨 Pièges connus / Code à NE PAS toucher

### Legacy survivant mais inactif
1. **`services/coloc_split.py`** : calcule du min-cash-flow + `data.debts`. Utilisé par `/coloc/pdf` en interne mais **frontend ne le consomme plus** (types virés en 0.11.0). Cleanup possible — cf "Idée #7" ci-dessus.
2. **`/coloc/breakdown` endpoint** : retourne `debts`, `summaries`, `charges_lines`. Plus appelé par le frontend depuis 0.5.7. Endpoint reste pour `/coloc/pdf`.
3. **`SettleBadge` composant** : déjà supprimé du frontend en 0.5.7.
4. **`ChargeSplit.settled_at` colonne** : conservée pour rétro-compat et un test (`test_joint_account.py`). Pas exposée dans la nouvelle UI.
5. **`/charge-splits/*` endpoints (`/settle`, `/unsettle`)** : existent encore en backend mais frontend ne les appelle plus. Code mort de l'API.

### À NE PAS réintroduire
- ❌ **Min-cash-flow / "qui doit qui"** : aboli en 0.5.7, remplacé par le modèle abondement.
- ❌ **Neutralisation des charges joint** dans le solde projeté (mon erreur en 0.9.0, revertée en 0.9.1). À la place, on **injecte des events `expected_in`** qui équilibrent visuellement.
- ❌ **Suffixes de version `beta1`, `rc1`** : l'user a explicitement refusé en 0.6.0-beta1 → 0.5.6.

### Compat ascendante préservée
- ⚠️ Option `claude_api_key` dans `config.yaml` HA toujours lue (fallback si `llm_api_key` vide). À ne pas retirer.
- ⚠️ Backfill `_backfill_created_at_if_null` retiré en 0.11.0 (cf #55 ✅). Si un user upgrade depuis < 0.9.6 directement vers 0.11.0+, ses lignes auront `created_at = NULL` et apparaîtront rétroactivement. Solution : éditer manuellement chaque ligne pour poser un `valid_from`.

---

## 🛠 Commandes utiles

```bash
# Dev backend (DEV_MODE bypass auth, user de test "Dev User")
cd budget-app/backend
DEV_MODE=true LLM_API_KEY=... DATABASE_URL="sqlite:///./dev.db?check_same_thread=False" \
  .venv/bin/python -m uvicorn main:app --reload --port 8000

# Dev frontend
cd budget-app/frontend && npm run dev

# Tests backend (105 actuellement)
cd budget-app/backend && DEV_MODE=true DATABASE_URL="sqlite:///./test.db" .venv/bin/pytest tests/ -q

# Build frontend
cd budget-app/frontend && npm run build

# Récupérer un fichier ancien
git show <sha>:<path>

# Voir les builds GHA
# https://github.com/DustProgram/budget-multi-coloc/actions
```

## Setup dev (une seule fois)

```bash
brew install python@3.12
cd budget-app/backend
/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt pytest pytest-asyncio httpx
cd budget-app/frontend && npm install
```

## Tips critiques

- **Toujours filtrer par `user_id`** sauf `shopping` et `coloc` (partagés)
- **WAL mode SQLite crucial** pour l'eMMC HA Green
- **Le scénario `test_scenario_validated_excel.py` doit toujours passer** — c'est la régression de référence
- **GHA build = trigger sur main uniquement** (cf `feedback_merge_direct_on_main.md`)
- **Cache budget** : invalidation auto via listener SQLAlchemy à chaque mutation. Peut être forcé avec `budget_cache.invalidate_all()`.
- **Rate-limit LLM** : `check_rate_limits(db)` avant + `record_usage(db, ...)` après chaque appel (ai_chat / ai_import)
