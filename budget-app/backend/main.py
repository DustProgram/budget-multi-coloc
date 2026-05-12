"""
Budget Multi-Coloc - Backend FastAPI
Entrée principale de l'application.
"""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from api import (
    accounts, account_members, incomes, charges, charge_splits,
    transfers, savings, purchases, shopping, coloc, simulator, dashboard,
    health, notifier as notifier_api, users as users_api,
    custom_events, messages as messages_api, auth_login, auth_logout,
    households as households_api,
    calendar as calendar_api,
    chat as chat_api,
    import_ as import_api,
)
from models.base import init_db
from services.backup import perform_monthly_backup
from services.auth import HAUserMiddleware

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "info").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Init au démarrage
    logger.info("🚀 Démarrage Budget Multi-Coloc")
    init_db()

    # Planifier le backup mensuel (1er de chaque mois à 03h00)
    if os.environ.get("BACKUP_ENABLED", "true").lower() == "true":
        scheduler.add_job(
            perform_monthly_backup,
            CronTrigger(day=1, hour=3, minute=0),
            id="monthly_backup",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("📅 Backup mensuel programmé (1er du mois à 03h00)")

    yield

    # Cleanup à l'arrêt
    if scheduler.running:
        scheduler.shutdown()
    logger.info("👋 Arrêt propre")


app = FastAPI(
    title="Budget Multi-Coloc",
    description="Gestionnaire de budget et colocation pour Home Assistant",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
)

# CORS uniquement pour le dev local. Ingress HA gère le reste.
if os.environ.get("DEV_MODE") == "true":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Middleware d'authentification via headers Ingress HA
app.add_middleware(HAUserMiddleware)

# ===== Routes API =====
app.include_router(health.router, prefix="/api/health", tags=["health"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(account_members.router, prefix="/api/accounts", tags=["account-members"])
app.include_router(incomes.router, prefix="/api/incomes", tags=["incomes"])
app.include_router(charges.router, prefix="/api/charges", tags=["charges"])
app.include_router(charge_splits.router, prefix="/api/charge-splits", tags=["charge-splits"])
app.include_router(transfers.router, prefix="/api/transfers", tags=["transfers"])
app.include_router(savings.router, prefix="/api/savings", tags=["savings"])
app.include_router(purchases.router, prefix="/api/purchases", tags=["purchases"])
app.include_router(shopping.router, prefix="/api/shopping", tags=["shopping-list"])
app.include_router(coloc.router, prefix="/api/coloc", tags=["coloc"])
app.include_router(simulator.router, prefix="/api/simulator", tags=["simulator"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(calendar_api.router, prefix="/api/calendar", tags=["calendar"])
app.include_router(notifier_api.router, prefix="/api/notifier", tags=["notifier"])
app.include_router(users_api.router, prefix="/api/users", tags=["users"])
app.include_router(custom_events.router, prefix="/api/custom-events", tags=["custom-events"])
app.include_router(messages_api.router, prefix="/api/accounts", tags=["messages"])
app.include_router(auth_login.router, prefix="/api/auth/login", tags=["auth-login"])
app.include_router(auth_logout.router, prefix="/api/auth/logout", tags=["auth-logout"])
app.include_router(households_api.router, prefix="/api/households", tags=["households"])
app.include_router(chat_api.router, prefix="/api/chat", tags=["chat"])
app.include_router(import_api.router, prefix="/api/import", tags=["import"])

# ===== Frontend statique (PWA) =====
static_dir = Path(os.environ.get("STATIC_DIR", "/app/static"))
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(request: Request, full_path: str):
        """Catch-all pour la SPA React (gère le routing client-side).

        Réécrit les paths relatifs (./assets/...) du index.html produit
        par Vite vers des paths absolus préfixés par X-Ingress-Path,
        que le supervisor HA envoie sur chaque requête ingress. Sans ça
        le navigateur résout `./` à la racine de l'host HA et 404 sur
        les bundles JS/CSS.
        """
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)

        # Sert un fichier statique racine (manifest.webmanifest, registerSW.js, sw.js, icônes…)
        if full_path:
            candidate = static_dir / full_path
            if candidate.is_file() and candidate.resolve().is_relative_to(static_dir.resolve()):
                return FileResponse(candidate)

        # Sinon : index.html avec réécriture du base path
        ingress_path = request.headers.get("X-Ingress-Path", "").rstrip("/")
        index_html = (static_dir / "index.html").read_text(encoding="utf-8")
        if ingress_path:
            index_html = index_html.replace('="./', f'="{ingress_path}/')
        return HTMLResponse(index_html)
