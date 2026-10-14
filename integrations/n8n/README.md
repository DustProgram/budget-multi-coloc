# n8n : dossier Google Drive → relevés importés automatiquement

Chaque personne dépose ses relevés (CSV/OFX BRED, PDF Sumeria) dans **son** dossier Drive.
n8n les envoie à l'app, qui rapproche tout seul ce qu'elle peut et pose les questions sur le reste.

## Installer n8n sur le VPS (à côté de l'app)

Ajouter à `deploy/docker-compose.yml` :

```yaml
  n8n:
    image: docker.n8n.io/n8nio/n8n:1.80.0
    restart: unless-stopped
    environment:
      N8N_HOST: n8n.mondomaine.fr
      N8N_PROTOCOL: https
      WEBHOOK_URL: https://n8n.mondomaine.fr/
      GENERIC_TIMEZONE: Europe/Paris
    volumes:
      - n8n-data:/home/node/.n8n
    mem_limit: 768m
```

(+ `n8n-data:` dans `volumes:`), et dans `deploy/Caddyfile` :

```
n8n.mondomaine.fr {
	reverse_proxy n8n:5678
}
```

Crée le compte propriétaire n8n dès le premier lancement (sinon n'importe qui peut le faire).

## Le workflow (un par personne, ou un seul avec un Switch)

1. **Google Drive Trigger** — *File Created*, dossier `Budget/Nathan/Relevés`.
2. **Google Drive** — *Download* le fichier (`fileId` du trigger).
3. **Extract From File** → *Move File to Base64 String* (champ `data`).
4. **HTTP Request**
   - `POST http://app:8000/api/agent/statements` (réseau docker interne, pas besoin de passer par Internet)
   - Header `Authorization: Bearer <AGENT_API_TOKEN>`
   - Body JSON :
     ```json
     {
       "username": "nathan",
       "account_id": 1,
       "filename": "{{ $('Google Drive Trigger').item.json.name }}",
       "content_b64": "{{ $json.data }}"
     }
     ```
   L'`account_id` est visible dans l'URL de l'app (page Comptes) ou via `POST /api/agent/whoami {"username":"nathan"}`.
5. **Google Drive** — *Move* le fichier dans `Budget/Nathan/Traités`.

Un sous-dossier par compte (`Relevés/BRED`, `Relevés/Sumeria joint`) = un trigger par compte, chacun avec son `account_id`.

## Relance des questions

Si Hermes n'a pas de tâche planifiée, n8n peut le faire : **Schedule Trigger** (19h) →
`GET http://app:8000/api/agent/pending` → pour chaque groupe, envoyer le message (nœud Discord, etc.) →
`POST /api/agent/notified`. Mais les réponses devront quand même passer par Hermes (ou par l'app).

## Synchro bancaire directe (plus tard)

Pour éviter les exports manuels : un agrégateur DSP2 (Enable Banking a un accès gratuit pour
ses propres comptes ; à vérifier pour BRED et Sumeria). Un cron n8n récupérerait les transactions
et les enverrait en CSV/JSON sur le même endpoint.
