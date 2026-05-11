"""
Budget Multi-Coloc - Backend FastAPI
Entrée principale de l'application.
"""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from api import accounts, incomes, charges, transfers, savings, purchases, shopping, coloc, simulator, dashboard, health
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
app.include_router(incomes.router, prefix="/api/incomes", tags=["incomes"])
app.include_router(charges.router, prefix="/api/charges", tags=["charges"])
app.include_router(transfers.router, prefix="/api/transfers", tags=["transfers"])
app.include_router(savings.router, prefix="/api/savings", tags=["savings"])
app.include_router(purchases.router, prefix="/api/purchases", tags=["purchases"])
app.include_router(shopping.router, prefix="/api/shopping", tags=["shopping-list"])
app.include_router(coloc.router, prefix="/api/coloc", tags=["coloc"])
app.include_router(simulator.router, prefix="/api/simulator", tags=["simulator"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])

# ===== Frontend statique (PWA) =====
static_dir = Path(os.environ.get("STATIC_DIR", "/app/static"))
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Catch-all pour la SPA React (gère le routing client-side)."""
        # Routes API non gérées ici
        if full_path.startswith("api/"):
            return {"detail": "Not Found"}, 404

        # Sinon, on sert index.html (le router React prend le relais)
        return FileResponse(static_dir / "index.html")
