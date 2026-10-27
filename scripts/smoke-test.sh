#!/bin/sh
# Checks a running API end to end: probes answer, a job can be created, and a worker finishes it.
# Usage: scripts/smoke-test.sh [base_url]   (defaults to http://localhost:8080)
set -eu
BASE=${1:-http://localhost:8080}

curl -fsS "$BASE/health" > /dev/null
curl -fsS "$BASE/ready" > /dev/null

ID=$(curl -fsS -X POST "$BASE/jobs" -H 'content-type: application/json' -d '{"task":"smoke"}' \
  | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
[ -n "$ID" ] || { echo "job was not created"; exit 1; }

for _ in $(seq 1 30); do
  if curl -fsS "$BASE/jobs" | grep -q "\"id\":$ID,\"payload\":{[^}]*},\"status\":\"done\""; then
    echo "job $ID done"
    exit 0
  fi
  sleep 1
done
echo "job $ID was not finished by a worker in 30 seconds"
exit 1
