# 📥 Installation sur Home Assistant Green

## Prérequis

- Home Assistant OS 2024.1+ (déjà sur ton HA Green)
- Une clé USB **dédiée** d'au moins 2 Go (jamais débranchée)
- Accès SSH au HA Green (add-on "Terminal & SSH")

## Étape 1 : Préparer la clé USB chiffrée LUKS

1. Branche la clé USB sur le HA Green
2. SSH vers ton HA Green via l'add-on Terminal
3. Identifie la clé :
   ```bash
   lsblk
   # Exemple : /dev/sda avec une partition /dev/sda1
   ```
4. Chiffre-la avec LUKS (⚠️ **efface tout le contenu**) :
   ```bash
   cryptsetup luksFormat /dev/sda1
   # Type "YES" et choisis une passphrase forte
   ```
5. Récupère l'UUID :
   ```bash
   blkid /dev/sda1
   # Note l'UUID, ex: UUID="abc-123-def"
   ```
6. Formate la partition interne en ext4 :
   ```bash
   cryptsetup luksOpen /dev/sda1 budget_temp
   mkfs.ext4 /dev/mapper/budget_temp
   cryptsetup luksClose budget_temp
   ```

## Étape 2 : Stocker la passphrase

Dans HA, fichier `secrets.yaml` :
```yaml
luks_passphrase: "TA_PASSPHRASE_ICI"
backup_passphrase: "AUTRE_PASSPHRASE_POUR_BACKUPS"
```

## Étape 3 : Installer l'add-on

1. Settings → Apps → ⋮ → Repositories
2. Ajoute : `https://github.com/TON-USER/budget-multi-coloc`
3. Clique "Add"
4. Dans le store, cherche "Budget Multi-Coloc" → Install

## Étape 4 : Configurer l'add-on

Dans l'onglet "Configuration" de l'add-on :
```yaml
usb_device: "/dev/disk/by-uuid/abc-123-def"  # Ton UUID
usb_mount_point: "/data"
log_level: "info"
backup_enabled: true
external_port_enabled: false  # Active si tu veux le port 8765
external_port_modules:
  - "courses"
  - "coloc-summary"
default_currency: "EUR"
default_locale: "fr_FR"
```

## Étape 5 : Démarrer

1. Onglet "Info" → Start
2. Vérifie les logs : tu devrais voir :
   ```
   🔐 Initialisation du stockage chiffré...
   ✅ Clé USB détectée
   ✅ Volume LUKS déverrouillé
   ✅ Clé montée
   🚀 Démarrage du backend FastAPI (port 8000)...
   📅 Backup mensuel programmé (1er du mois à 03h00)
   ```
3. Active "Show in sidebar"
4. Clique sur "💰 Budget" dans la sidebar HA → ton app est là !

## Étape 6 : Premier utilisateur

Le premier utilisateur HA qui se connecte à l'app devient automatiquement admin.

Pour ajouter tes colocs :
1. Crée un compte HA pour chacun (Settings → People → Users → Add)
2. Donne-leur les identifiants
3. Quand ils se connectent à HA et accèdent au menu "Budget", leur compte est créé automatiquement
4. Toi (admin), tu peux les marquer comme "coloc" dans Settings de l'app

## Mise à jour

Quand une nouvelle version est releasée sur GitHub :
- HA détecte automatiquement la mise à jour
- Bouton "Update" apparaît dans l'onglet "Info" de l'add-on
- Les données restent intactes (stockées sur la clé USB)
