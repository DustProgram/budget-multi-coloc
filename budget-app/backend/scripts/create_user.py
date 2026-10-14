"""Crée ou réinitialise un compte local (mode standalone).

    docker compose exec app python scripts/create_user.py <username> [--admin] [--coloc] [--reset]

Le mot de passe est demandé au clavier (jamais en argument : il finirait
dans l'historique du shell).
"""
import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import ExternalCredential, ExternalScope  # noqa: E402
from models.base import SessionLocal, init_db  # noqa: E402
from services.external_auth import hash_password  # noqa: E402
from services.local_users import create_local_user, validate_password  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("username")
    p.add_argument("--display-name")
    p.add_argument("--admin", action="store_true")
    p.add_argument("--coloc", action="store_true", help="scope limité (courses, chat, récap coloc)")
    p.add_argument("--reset", action="store_true", help="change le mot de passe d'un compte existant")
    args = p.parse_args()

    password = getpass.getpass("Mot de passe : ")
    if password != getpass.getpass("Confirmation : "):
        print("Les mots de passe ne correspondent pas.", file=sys.stderr)
        return 1

    init_db()
    db = SessionLocal()
    try:
        if args.reset:
            cred = db.query(ExternalCredential).filter(ExternalCredential.username == args.username).first()
            if not cred:
                print("Compte introuvable.", file=sys.stderr)
                return 1
            cred.password_hash = hash_password(validate_password(password))
            db.commit()
            print(f"Mot de passe de {args.username} mis à jour.")
            return 0
        scope = ExternalScope.COLOC if args.coloc else ExternalScope.FULL
        user = create_local_user(db, args.username, password, args.display_name, scope, args.admin)
        print(f"Compte créé : {user.ha_username} (id={user.id}, admin={user.is_admin}, scope={scope.value})")
        return 0
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
