#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Uso: $0 <arquivo.dump>"
  exit 1
fi

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-crm}"
POSTGRES_DB="${POSTGRES_DB:-crm}"
FILE="$1"

test -f "$FILE"

docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "$FILE"

echo "Restauração concluída a partir de: $FILE"
