#!/usr/bin/with-contenv bashio
# ==============================================================================
# Monte la clé USB chiffrée LUKS avant le démarrage du service Budget
# ==============================================================================
set -e

USB_DEVICE=$(bashio::config 'usb_device')
USB_MOUNT_POINT=$(bashio::config 'usb_mount_point')
LUKS_NAME="budget_encrypted"

bashio::log.info "🔐 Initialisation du stockage chiffré..."

# Vérifier la présence de la clé USB
if [ ! -b "${USB_DEVICE}" ]; then
    bashio::log.error "❌ Clé USB introuvable : ${USB_DEVICE}"
    bashio::log.error "Branche la clé et redémarre l'add-on."
    exit 1
fi
bashio::log.info "✅ Clé USB détectée : ${USB_DEVICE}"

# Récupérer la passphrase depuis le secret HA
if ! bashio::config.exists 'luks_passphrase' && [ -z "${SUPERVISOR_TOKEN}" ]; then
    bashio::log.error "❌ La passphrase LUKS n'est pas configurée."
    bashio::log.error "Ajoute 'luks_passphrase' dans secrets.yaml de HA."
    exit 1
fi

# Récupérer la passphrase
LUKS_PASS="${LUKS_PASSPHRASE:-$(bashio::config 'luks_passphrase')}"

# Déverrouiller le volume LUKS s'il ne l'est pas déjà
if [ ! -e "/dev/mapper/${LUKS_NAME}" ]; then
    bashio::log.info "🔓 Déverrouillage du volume LUKS..."
    echo -n "${LUKS_PASS}" | cryptsetup luksOpen "${USB_DEVICE}" "${LUKS_NAME}" --key-file=- || {
        bashio::log.error "❌ Échec du déverrouillage. Passphrase correcte ?"
        exit 1
    }
fi
bashio::log.info "✅ Volume LUKS déverrouillé"

# Créer le point de montage
mkdir -p "${USB_MOUNT_POINT}"

# Monter le volume
if ! mountpoint -q "${USB_MOUNT_POINT}"; then
    bashio::log.info "💾 Montage de la clé sur ${USB_MOUNT_POINT}..."
    mount "/dev/mapper/${LUKS_NAME}" "${USB_MOUNT_POINT}" || {
        bashio::log.error "❌ Échec du montage"
        cryptsetup luksClose "${LUKS_NAME}" || true
        exit 1
    }
fi
bashio::log.info "✅ Clé montée"

# Créer la structure si premier démarrage
mkdir -p "${USB_MOUNT_POINT}/db" "${USB_MOUNT_POINT}/uploads" "${USB_MOUNT_POINT}/exports"

bashio::log.info "🚀 Stockage chiffré prêt. Démarrage du backend..."
