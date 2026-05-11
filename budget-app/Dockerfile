# Dockerfile multi-arch (aarch64 pour HA Green, amd64 pour les autres)
ARG BUILD_FROM=ghcr.io/hassio-addons/base:14.3.2
ARG BUILD_ARCH=aarch64

# ============================================================
# Stage 1 : Build du frontend React
# ============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /build
COPY frontend/package*.json ./
# Install everything: build tooling (tsc, vite, tailwind...) lives in devDependencies
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ============================================================
# Stage 2 : Image finale (très légère, Alpine)
# ============================================================
FROM ${BUILD_FROM}

# Métadonnées
LABEL maintainer="DustProgram"
LABEL org.opencontainers.image.source="https://github.com/DustProgram/budget-multi-coloc"

# Dépendances système minimales. Pas de pin de version Python : on prend
# la 3.x fournie par la base HA. Le code marche sur 3.11+ (testé jusqu'à 3.13).
RUN apk add --no-cache \
    python3 \
    py3-pip \
    cryptsetup \
    gnupg \
    sqlite \
    tzdata \
    && rm -rf /var/cache/apk/*

# Python deps avec cache optimisé
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

# Code backend
COPY backend/ /app/

# Frontend buildé (depuis stage 1)
COPY --from=frontend-builder /build/dist /app/static

# Scripts s6 (gestion du service)
COPY rootfs /

# Permissions
RUN chmod a+x /etc/services.d/budget/run \
    && chmod a+x /etc/cont-init.d/00-mount-usb.sh

# Configuration runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/data \
    STATIC_DIR=/app/static

EXPOSE 8000 8765

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --spider http://localhost:8000/api/health || exit 1
