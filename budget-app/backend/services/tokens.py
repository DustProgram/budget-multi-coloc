"""Tokens d'accès externe (port 8765)."""
import secrets


def generate_external_token() -> str:
    """Token URL-safe de 32 octets (~43 chars base64). Suffisamment d'entropie
    pour résister au brute force, court à copier-coller."""
    return secrets.token_urlsafe(32)
