# Automatisations : relevés, tickets, quittances (proposition)

Statut : **proposition, rien d'implémenté**. Ce doc sert à valider l'approche avant de coder.

## Principe : le déclaratif d'abord, l'IA ensuite

L'app repose déjà sur des **déclarations** : revenus, charges, virements récurrents,
épargne, membres du compte joint. L'automatisation ne doit pas deviner à la place
de l'utilisateur. Elle **rapproche** ce qui arrive (lignes de relevé, tickets,
quittances) de ce qui a été déclaré :

1. Une ligne colle à une déclaration (libellé + montant ± tolérance + date ± quelques jours)
   → **rapprochée automatiquement**.
2. Une ligne ne colle à rien, ou à plusieurs choses → elle part dans une **boîte « À valider »**
   et l'agent **pose la question** (« 650 € VIR SEPA M. DUPONT le 03/11 : c'est le loyer ? »).
3. La réponse devient une **règle** (« VIR SEPA M. DUPONT ≈ 650 € → Loyer ») ou une
   **nouvelle déclaration** si c'est une charge récurrente que tu n'avais pas saisie.

Avec le temps, presque tout se rapproche tout seul et l'agent ne demande plus que les vrais cas nouveaux.
L'IA ne sert qu'à lire les documents (OCR + extraction) et à proposer. Elle ne valide jamais seule.

## Architecture cible sur le VPS

```
                  ┌─────────────── VPS Hostinger KVM 1 ───────────────┐
 Google Drive ──▶ │ n8n ──(Bearer token « ingest »)──▶ Budget API      │
 (1 dossier/user) │  │                                   │  SQLite      │
 Banque (DSP2) ──▶│  │                                   ▼              │
                  │  └──▶ Hermes Agent ◀──(MCP/HTTP)── Boîte « À valider »│
                  └───────────│────────────────────────────────────────┘
                              ▼
                     Telegram / WhatsApp : questions à l'utilisateur
```

- **Budget API** : la source de vérité (déjà en place).
- **n8n** : la tuyauterie. Il surveille les dossiers Drive, interroge la banque, pousse vers l'API. Pas de logique métier.
- **Hermes** : la conversation. Il lit la boîte « À valider », pose les questions, enregistre les réponses
  via les outils de l'API (les mêmes que le chat IA de l'app, cf `services/ai_tools.py`).

Ressources : n8n ≈ 300–500 Mo, Hermes ≈ 200–400 Mo, l'app ≈ 150 Mo. Ça tient dans 4 Go.
En revanche, **pas de LLM local** sur 1 vCPU : la lecture des tickets passe par une API
(Claude, Gemini, GPT…, déjà supportées par `services/llm_client.py`). Compter quelques centimes par document.

## Ce qu'il faut ajouter dans l'app

| Brique | Rôle | Effort |
|---|---|---|
| Table `BankTransaction` | Lignes de relevé brutes : date, montant, libellé, compte, source, hash anti-doublon, statut (`rapprochée`, `à valider`, `ignorée`), lien vers la déclaration | 1 h |
| Table `MatchingRule` | Libellé (contient/regex) + montant ± tolérance + jour ± fenêtre → type (charge X, revenu Y, abondement coloc de Z…) | 1 h |
| Moteur de rapprochement | Règles d'abord, puis heuristique sur les déclarations, puis « à valider » | 3 h |
| `POST /api/ingest/transactions` | JSON de transactions (sortie banque/n8n) | 1 h |
| `POST /api/ingest/statement` | Fichier CSV / OFX / PDF de relevé | 2 h |
| `POST /api/ingest/document` | Ticket, facture, quittance (réutilise `services/ai_import.py`) | 1 h |
| Tokens API par utilisateur, scope `ingest` | Pour n8n/Hermes, révocables, jamais en `full` | 1 h |
| Page « À valider » + API `inbox` | Valider/corriger depuis l'app (en plus de Hermes) | 3 h |
| Coloc : libellés → abondements | « VIR CAMILLE » vers le compte joint = abondement de Camille pour le mois M, alimente `joint_contributions` | 2 h |
| Serveur MCP (ou outils HTTP) pour Hermes | `list_inbox`, `resolve_item`, `declare_charge`, `month_summary`… | 2 h |

## Les flux n8n

**A. Dossier Drive par utilisateur.** Chacun partage un dossier `Budget/<prénom>/` avec
sous-dossiers `Relevés`, `Tickets`, `Quittances`. Un trigger « nouveau fichier » télécharge le fichier,
l'envoie à `/api/ingest/...` avec le token de cet utilisateur, puis le déplace dans `Traité/`.
Avantage : aucune donnée bancaire à stocker côté serveur, chacun dépose ses exports quand il veut.

**B. Synchro bancaire directe (optionnelle).** Il faut passer par un agrégateur DSP2 agréé.
Pour un usage perso, la piste la plus réaliste est **Enable Banking**, qui a un accès gratuit
pour relier ses propres comptes. GoCardless Bank Account Data a fermé les nouvelles
inscriptions en 2025. Powens et Bridge sont des offres pro payantes.
Le consentement est à renouveler tous les 180 jours, avec une authentification forte côté banque.
Un cron n8n quotidien récupère les transactions et les envoie à `/api/ingest/transactions`.
À vérifier avant de coder : les conditions actuelles d'Enable Banking et la couverture de vos banques.

**C. Relance quotidienne.** S'il reste des éléments « à valider », n8n réveille Hermes,
qui envoie les questions groupées sur Telegram.

## Sécurité

- n8n derrière Caddy (`n8n.mondomaine.fr`) avec son propre login, ou seulement via Tailscale/SSH tunnel.
- Hermes n'est pas exposé sur Internet. Il ne parle qu'à Telegram (sortant) et à l'API (réseau docker).
- Les tokens n8n/Hermes ont le scope `ingest` : ils ajoutent des lignes, ils ne lisent pas tout le budget
  et ne gèrent pas les comptes.
- Les identifiants bancaires ne passent jamais par l'app. Seul l'agrégateur les voit.

## Ordre proposé

1. ✅ **Déploiement VPS sécurisé** (ce qui vient d'être fait, cf `deploy/README.md`)
2. Tables + moteur de rapprochement + import CSV/OFX + page « À valider » (utilisable sans IA ni n8n)
3. Tokens `ingest` + endpoints d'ingestion + flux n8n Drive
4. Hermes : outils MCP + questions sur Telegram
5. Synchro bancaire directe (si l'étape 3 ne suffit pas)

## Questions ouvertes

- Hermes = **Hermes Agent de Nous Research** (agent auto-hébergé avec Telegram et MCP), ou un modèle Hermes
  servi en local ? Ça change la façon de brancher les outils.
- Quelles banques (pour vérifier les formats d'export CSV/OFX et la couverture de l'agrégateur) ?
- Canal pour les questions : Telegram, WhatsApp, Discord, ou seulement la page « À valider » ?
- Les colocs utiliseront-ils aussi le dépôt Drive, ou seulement toi au début ?
