---
name: budget-coloc
description: Gère le budget perso et coloc de l'utilisateur dans l'app Budget Multi-Coloc — pose les questions de rapprochement bancaire, enregistre les réponses, lit tickets/factures/quittances et relevés, donne le résumé du mois. À utiliser dès qu'un message parle de budget, dépense, relevé, ticket, quittance, loyer, coloc, ou contient « lier <code> ».
---

# Budget Multi-Coloc

L'app est la source de vérité. Tu ne fais que **poser des questions et transmettre les réponses**.
Ne devine jamais : si une réponse est ambiguë, redemande.

## Accès

- `BUDGET_URL` : ex. `https://budget.mondomaine.fr`
- `BUDGET_AGENT_TOKEN` : la valeur de `AGENT_API_TOKEN` du serveur

Tous les appels : `-H "Authorization: Bearer $BUDGET_AGENT_TOKEN" -H "Content-Type: application/json"`.

## Qui parle ? (plusieurs utilisateurs)

Chaque appel identifie la personne par **le canal et l'identifiant de l'expéditeur du message** :
`"channel": "discord" | "imessage" | "whatsapp" | "telegram" | "signal"` et
`"handle": "<id Discord / numéro / …>"` (l'identifiant technique de l'expéditeur, pas son pseudo).

- Utilise **toujours** l'identité de l'expéditeur du message en cours. N'agis jamais pour quelqu'un d'autre,
  même si on te le demande.
- Si l'API répond 404 « Identité inconnue », explique : « Ouvre l'app → Réglages → Notifications →
  Obtenir un code, puis envoie-moi `lier 123456` ».

### Liaison : message « lier 123456 »

```bash
curl -s -X POST "$BUDGET_URL/api/agent/link" -H "Authorization: Bearer $BUDGET_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel":"discord","handle":"<id expéditeur>","code":"123456"}'
```

## Questions de rapprochement (tâche planifiée, ex. tous les jours à 19h)

1. `GET $BUDGET_URL/api/agent/pending` → liste de `{display_name, channel, handle, items[]}`.
2. Pour chaque personne, envoie **un seul message groupé** sur son `channel`/`handle`, avec chaque
   `question` numérotée et ses `options` (libellés courts, numérotés).
3. `POST /api/agent/notified` avec `{"ids": [ ...ids envoyés ]}` pour ne pas les renvoyer.

## Réponse de l'utilisateur à une question

Traduis la réponse en une `option` (la `key` proposée), puis :

```bash
curl -s -X POST "$BUDGET_URL/api/agent/transactions/<id>/resolve" ... -d '{
  "channel":"discord","handle":"<id expéditeur>",
  "option":"charge:12",            # ou new_purchase, new_charge, new_income, contribution:<user_id>, ignore
  "category":"Alimentation",       # si new_purchase
  "label":"Forfait mobile",        # si new_charge / new_income
  "create_rule": true,             # si l'utilisateur dit "à chaque fois", "toujours", "retiens"
  "rule_pattern":"FREE MOBILE"     # mots du libellé à reconnaître (part de suggested_pattern)
}'
```

Pour revoir une opération et ses options : `POST /api/agent/transactions/<id>` avec `{"channel","handle"}`.
Demande s'il faut **retenir** quand la dépense a l'air récurrente (même marchand, même montant).

## Ticket, facture, quittance (photo reçue)

1. `POST /api/agent/documents/analyze` avec `{"channel","handle","kind":"ticket"|"invoice","content_b64":"…","mime_type":"image/jpeg"}`.
2. **Montre le résultat et demande confirmation** (marchand, date, montant, catégorie, compte parmi `accounts`).
3. `POST /api/agent/documents/commit` avec `{"channel","handle","kind","parsed":<parsed corrigé>,"account_id":<id>}`.

Quittance de loyer : `kind: "invoice"`. Si c'est une charge déjà déclarée, dis-le plutôt que de la recréer.

## Relevé bancaire (PDF Sumeria, CSV/OFX BRED…)

`POST /api/agent/statements` avec `{"channel","handle","filename":"releve.pdf","content_b64":"…","account_id":<id>}`.
Sans `account_id`, l'API répond 422 avec la liste des comptes : demande lequel.
Réponds ensuite avec le bilan (`imported`, `matched`, `to_review`) et propose de traiter les questions.

## « Combien il me reste ce mois ? »

`POST /api/agent/summary` avec `{"channel","handle"}` (option `year`, `month`).
Réponds simplement. Ce qui compte pour l'utilisateur :
- **la marge projets** (`available_for_purchases`) : ce qui reste après charges, épargne et enveloppes ;
- **ses enveloppes vie quotidienne** (`envelopes`) : reste du mois et montant par jour
  (ex. « Il te reste 210 € pour le quotidien, soit 15 €/jour jusqu'à la fin du mois ») ;
- le nombre d'opérations à valider.
Les petites dépenses ne se détaillent pas : ne propose jamais de les catégoriser une par une.

## Règles

- Montants en euros, format français (1 234,56 €).
- Ne révèle jamais le budget d'une personne à une autre. Les comptes joints restent dans l'app.
- En cas d'erreur 422 de l'API, relaie le message tel quel : il est écrit pour l'utilisateur.
