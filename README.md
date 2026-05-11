# 💰 Budget Multi-Coloc - Add-on Home Assistant

> Gestionnaire de budget personnel et colocation, hébergé sur Home Assistant, avec stockage chiffré sur clé USB.

## ✨ Fonctionnalités

- **Multi-comptes bancaires** (compte courant, livret A, PEA...)
- **Multi-utilisateurs** via comptes Home Assistant (chaque coloc a son espace + zone partagée)
- **Colocation intelligente** : 4 modes de partage (Perso, Égal, %, Montant fixe)
- **Revenus, charges fixes, virements interbancaires, épargne auto multi-lignes**
- **Achats avec paiement en plusieurs fois** (3x, 4x...) répartis automatiquement
- **Simulateur d'achat** : "Est-ce que je peux acheter ?" (verdict global + compte)
- **Vues mensuelle (timeline jour par jour) et annuelle (12 mois)**
- **Liste de courses partagée** entre colocs
- **Export PDF du résumé coloc** : qui doit quoi à qui
- **Stockage chiffré LUKS** sur clé USB
- **Backup mensuel automatique** chiffré GPG

## 🚀 Installation rapide

1. Dans Home Assistant : **Paramètres → Apps → Ajouter un dépôt**
2. Coller l'URL : `https://github.com/DustProgram/budget-multi-coloc`
3. Installer l'add-on "Budget Multi-Coloc"
4. Suivre [docs/INSTALL.md](docs/INSTALL.md) pour le setup de la clé USB chiffrée

## 📚 Documentation

- [Installation détaillée](docs/INSTALL.md)
- [Stratégie de backup](docs/BACKUP.md)
- [Développement local](docs/DEVELOPMENT.md)
- [Architecture technique](docs/ARCHITECTURE.md)

## 🛠️ Stack technique

- **Backend** : Python 3.12 + FastAPI + SQLAlchemy + SQLite (WAL mode)
- **Frontend** : React 18 + Vite + TypeScript + Tailwind CSS + Recharts
- **Container** : Docker Alpine ARM64/AMD64
- **CI/CD** : GitHub Actions (build multi-arch, tests, releases)
- **Tests** : pytest (backend), vitest (frontend), Playwright (E2E)

## 🔐 Sécurité

- Authentification déléguée à Home Assistant (Ingress)
- Données stockées sur clé USB chiffrée LUKS AES-256
- Backups chiffrés GPG
- Aucune dépendance cloud externe

## 📜 Licence

MIT - voir [LICENSE](LICENSE)
