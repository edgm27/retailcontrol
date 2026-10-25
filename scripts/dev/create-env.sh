#!/usr/bin/env bash
# Genera .env a partir de .env.example con secretos ALEATORIOS (solo desarrollo/CI).
# No sobrescribe un .env existente salvo con --force.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ -f .env && "${1:-}" != "--force" ]]; then
  echo ".env ya existe (use --force para regenerarlo)."; exit 0
fi
OWN=$(openssl rand -hex 16); APP=$(openssl rand -hex 16); BK=$(openssl rand -hex 16)
sed -e "s/CAMBIAR_owner_password/$OWN/g" \
    -e "s/CAMBIAR_app_password/$APP/g" \
    -e "s/CAMBIAR_backup_password/$BK/g" \
    -e "s|AUTH_SECRET=\"CAMBIAR\"|AUTH_SECRET=\"$(openssl rand -base64 32)\"|" \
    -e "s|MFA_ENCRYPTION_KEY=\"CAMBIAR\"|MFA_ENCRYPTION_KEY=\"$(openssl rand -base64 32)\"|" \
    -e "s|RECOVERY_CODE_PEPPER=\"CAMBIAR\"|RECOVERY_CODE_PEPPER=\"$(openssl rand -hex 32)\"|" \
    .env.example > .env
chmod 600 .env
echo ".env creado con secretos aleatorios de desarrollo."
