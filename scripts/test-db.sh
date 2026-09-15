#!/usr/bin/env bash
# Runs the database test suite.
#
#   pnpm test:db                      # throwaway local Postgres (needs Postgres 15+ server binaries)
#   DATABASE_URL=postgres://... pnpm test:db   # an existing *disposable* database
#
# With the throwaway cluster, the Supabase stub is loaded and every migration is
# applied twice to prove idempotency. Each test file runs inside a transaction
# that is rolled back.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
TESTS="$ROOT/supabase/tests"
PSQL_OPTS=(-X -q -v ON_ERROR_STOP=1 --pset pager=off)
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

if [[ -n "${DATABASE_URL:-}" ]]; then
  CONN="$DATABASE_URL"
  echo "Using existing database from DATABASE_URL (migrations assumed applied)."
else
  PGBIN="${PGBIN:-$(pg_config --bindir 2>/dev/null || true)}"
  if [[ ! -x "$PGBIN/initdb" ]]; then
    echo "Postgres server binaries not found. Set PGBIN or DATABASE_URL." >&2
    exit 1
  fi
  WORK="$ROOT/.tmp/pgtest"
  PORT="${PGTEST_PORT:-54329}"
  rm -rf "$WORK" && mkdir -p "$WORK"
  "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust --locale=C.UTF-8 -E UTF8 >"$WORK/initdb.log"
  "$PGBIN/pg_ctl" -D "$WORK/data" -l "$WORK/server.log" -w \
    -o "-p $PORT -k $WORK -c listen_addresses='' -c timezone=UTC" start >/dev/null
  trap '"$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true' EXIT
  CONN="postgresql://postgres@/postgres?host=$WORK&port=$PORT"

  psql "${PSQL_OPTS[@]}" "$CONN" -f "$TESTS/setup/supabase_stub.sql"
  for pass in 1 2; do
    for f in "$MIGRATIONS"/*.sql; do
      if ! out="$(psql "${PSQL_OPTS[@]}" "$CONN" -f "$f" 2>&1 >/dev/null)"; then
        echo "Migration failed (pass $pass): $(basename "$f")" >&2
        echo "$out" >&2
        exit 1
      fi
    done
    echo "Migrations applied (pass $pass)."
  done
fi

failed=0
for f in "$TESTS"/*.sql; do
  name="$(basename "$f")"
  # Query output is discarded; assertion failures arrive on stderr.
  if out="$(psql "${PSQL_OPTS[@]}" "$CONN" -f "$f" 2>&1 >/dev/null)"; then
    echo "  ok    $name"
  else
    echo "  FAIL  $name"
    echo "$out" | sed 's/^/        /'
    failed=1
  fi
done

if [[ $failed -ne 0 ]]; then
  echo "Database tests failed." >&2
  exit 1
fi
echo "All database tests passed."
