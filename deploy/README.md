# Déploiement sur un VPS (Hostinger KVM 1)

Stack : **Caddy** (HTTPS Let's Encrypt automatique) → **app** (FastAPI + SPA, SQLite).
Seuls les ports 80/443 sont exposés. L'app tourne en `AUTH_MODE=standalone` :
pas de Home Assistant, connexion par identifiant + mot de passe.

Un KVM 1 (1 vCPU, 4 Go RAM) suffit largement : l'app consomme ~150 Mo, Caddy ~30 Mo.
Il reste de la place pour n8n et Hermes (voir `docs/AUTOMATISATIONS.md`).

## 1. Préparer le serveur (une seule fois)

OS conseillé : **Ubuntu 24.04** (template Hostinger).

```bash
# En root via la console Hostinger ou ssh root@IP
adduser nathan && usermod -aG sudo nathan
# Depuis TON poste : copie ta clé SSH
ssh-copy-id nathan@IP_DU_VPS

# Sur le VPS : SSH par clé uniquement
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Pare-feu + bannissement auto + mises à jour de sécu auto
sudo apt update && sudo apt install -y ufw fail2ban unattended-upgrades
sudo ufw default deny incoming && sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp
sudo ufw enable
sudo dpkg-reconfigure -plow unattended-upgrades

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker nathan   # puis se déconnecter/reconnecter
```

Le pare-feu Hostinger (hPanel → VPS → Pare-feu) peut aussi être activé avec les mêmes règles.

## 2. DNS

Chez ton registrar (ou hPanel → Domaines → DNS) : un enregistrement **A**
`budget.mondomaine.fr → IP_DU_VPS`. Attends qu'il réponde (`dig +short budget.mondomaine.fr`)
avant de lancer Caddy, sinon le certificat échoue.

## 3. Installer l'app

```bash
sudo mkdir -p /opt && sudo chown nathan /opt
git clone https://github.com/DustProgram/budget-multi-coloc.git /opt/budget-multi-coloc
cd /opt/budget-multi-coloc/deploy
cp .env.example .env && chmod 600 .env
nano .env        # DOMAIN, ACME_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD (long !)
docker compose up -d --build     # ~3 min au premier build sur 1 vCPU
docker compose logs -f app       # "Admin initial créé : …"
```

Ouvre `https://budget.mondomaine.fr`, connecte-toi, puis **vide `ADMIN_PASSWORD`
dans `.env`** (il ne sert qu'au tout premier démarrage).

Ajouter les colocs : **Réglages → Utilisateurs** (admin), ou en ligne de commande :

```bash
docker compose exec app python scripts/create_user.py camille --display-name Camille
docker compose exec app python scripts/create_user.py camille --reset   # mot de passe oublié
```

Accès « Coloc » (`--coloc` ou dans l'UI) = courses + chat + récap uniquement.

## 3 bis. Reprendre les données de Home Assistant (optionnel)

Sinon on repart d'une base vide.

1. **Récupérer `budget.db`** depuis HA. Le plus simple : HA → Paramètres → Système → Sauvegardes →
   sauvegarde partielle avec seulement l'add-on Budget → Télécharger. L'archive contient un
   `.tar.gz` de l'add-on, avec `data/db/budget.db` dedans.
   (Si l'option clé USB LUKS était utilisée, la base est sur la clé : `db/budget.db`.)
2. **L'envoyer sur le VPS** et la mettre en place, **avant** de créer des comptes :
   ```bash
   scp budget.db nathan@IP_DU_VPS:/tmp/
   cd /opt/budget-multi-coloc/deploy
   docker compose stop app
   docker compose run --rm -T app sh -c 'cat > /data/db/budget.db && rm -f /data/db/budget.db-wal /data/db/budget.db-shm' < /tmp/budget.db
   docker compose start app
   ```
3. **Donner un identifiant à chaque utilisateur existant**. Les comptes HA n'ont pas de mot de passe,
   et `ADMIN_USERNAME`/`ADMIN_PASSWORD` est ignoré quand la base contient déjà des utilisateurs :
   ```bash
   docker compose exec app python scripts/create_user.py --list
   docker compose exec app python scripts/create_user.py nathan --user-id 1 --admin
   docker compose exec app python scripts/create_user.py camille --user-id 2
   ```
   Chacun retrouve toutes ses données (comptes, charges, historique).

## 4. Mettre à jour

```bash
cd /opt/budget-multi-coloc && git pull
cd deploy && docker compose up -d --build
```

Alternative sans build sur le VPS : l'image `ghcr.io/dustprogram/budget-multi-coloc-standalone:latest`
est publiée par la CI à chaque push sur `main` → `docker compose pull && docker compose up -d`.

## 5. Sauvegardes

- **Quotidien** (sur le VPS) : `deploy/backup.sh` fait un snapshot SQLite cohérent.
  ```bash
  sudo mkdir -p /var/backups/budget && sudo chown nathan /var/backups/budget
  crontab -e
  # 15 3 * * * /opt/budget-multi-coloc/deploy/backup.sh >> /var/backups/budget/backup.log 2>&1
  ```
- **Mensuel chiffré** (GPG) : automatique dans le volume `budget-backups` si `BACKUP_PASSPHRASE` est défini.
- **Hors site** : un backup qui reste sur le même VPS ne protège pas d'une perte du VPS.
  Active les snapshots Hostinger et/ou copie `/var/backups/budget` ailleurs (`rclone` vers un Drive, etc.).

Restaurer :
```bash
docker compose stop app
gunzip -c /var/backups/budget/budget-AAAA-MM-JJ.db.gz | docker compose run --rm -T app \
  sh -c 'cat > /data/db/budget.db && rm -f /data/db/budget.db-wal /data/db/budget.db-shm'
docker compose start app
```

## Ce qui est en place côté sécurité

| Mesure | Où |
|---|---|
| HTTPS + renouvellement auto des certificats | Caddy |
| HSTS, CSP stricte, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` | `services/security.py` |
| Cookies `HttpOnly` + `Secure` + `SameSite=Strict` | `api/auth_login.py` |
| Rate-limit login : 5 essais/min/IP → 429 | `services/security.py` |
| Verrouillage du compte 15 min après 10 échecs | `services/security.py` |
| Header `X-Remote-User-Id` (HA) ignoré → pas d'usurpation | `services/auth.py` |
| `?token=` refusé (seulement `Authorization: Bearer`) | `services/auth.py` |
| Swagger `/api/docs` désactivé (`ENABLE_API_DOCS=true` pour le réactiver) | `main.py` |
| Requêtes > 15 Mo refusées | Caddy + `MaxBodySizeMiddleware` |
| Conteneur non-root, `cap_drop: ALL`, `no-new-privileges`, port 8000 non publié | `docker-compose.yml` |
| Cache offline du navigateur vidé à la connexion/déconnexion | `lib/AuthGate.tsx` |
| Tentatives de login journalisées (IP + username) | `docker compose logs app` |

À savoir : les sessions sont des cookies signés valables 30 jours. Changer un mot de passe
ne déconnecte pas les sessions déjà ouvertes. Pour tout invalider d'un coup :
`docker compose exec app rm /data/.session_secret && docker compose restart app`.
