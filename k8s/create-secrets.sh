#!/bin/sh
# Creates the database secret with a random password. Nothing secret is stored in git.
# Usage: k8s/create-secrets.sh [namespace]   (defaults to lab)
set -eu
NAMESPACE=${1:-lab}
PASSWORD=$(openssl rand -hex 16)
kubectl -n "$NAMESPACE" create secret generic platform-lab-db \
  --from-literal=POSTGRES_PASSWORD="$PASSWORD" \
  --from-literal=DATABASE_URL="postgres://lab:${PASSWORD}@postgres:5432/lab"
