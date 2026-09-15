#!/usr/bin/env bash
# Applies every migration in supabase/migrations to a database, in order.
#
#   DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-....pooler.supabase.com:5432/postgres" pnpm db:migrate
#
# Get the connection string from the Supabase dashboard: Connect → "Session pooler".
# Every migration is idempotent, so running this again (e.g. after adding a new
# migration) is safe. Each file runs in its own transaction and stops on the first error.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT/.env.local" && -z "${DATABASE_URL:-}" ]]; then
  # shellcheck disable=SC1091
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env.local" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to your Supabase connection string (Dashboard → Connect → Session pooler)." >&2
  exit 1
fi

if ! command -v psql >/dev/null; then
  echo "psql is required (Ubuntu: sudo apt install postgresql-client; macOS: brew install libpq)." >&2
  exit 1
fi

export PGOPTIONS="-c client_min_messages=warning"
for file in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$file")"
  # Connection poolers ignore PGOPTIONS, so quieten notices inside the session too.
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -c "set client_min_messages = warning" -f "$file" >/dev/null
done
echo "✔ All migrations applied."
