"""POST /api/auth/logout — clear le cookie session externe."""
from fastapi import APIRouter, Response

from services.external_auth import COOKIE_NAME

router = APIRouter()


@router.post("/", status_code=204)
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
