#!/bin/sh
# Resets the demo database to one run (Northwind week 1), so the take can run week 2 and compare.
# Needs `pnpm demo:serve` running (API on :8788). Your main database (memory_audit) is only read, never changed.
#   --copy-cache  first time: copy the main database's LLM cache, so the demo shows the same findings as the README
set -e
psql() { docker compose exec -T postgres psql -U audit "$@"; }
psql memory_audit -tc "select 1 from pg_database where datname='memory_audit_demo'" | grep -q 1 \
  || psql memory_audit -c "create database memory_audit_demo"
if [ "$1" = "--copy-cache" ]; then
  psql memory_audit_demo -qc "truncate llm_cache"
  docker compose exec -T postgres pg_dump -U audit --data-only -t llm_cache memory_audit | psql -q memory_audit_demo > /dev/null
fi
psql memory_audit_demo -qc "truncate runs, run_files restart identity"
curl -sf -X POST localhost:8788/api/audit -H 'content-type: application/json' -d '{"source":"fixture","snapshot":"earlier"}' > /dev/null
echo "demo db: 1 run (Northwind week 1)"
