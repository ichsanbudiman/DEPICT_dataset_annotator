#!/bin/sh
set -eu
mkdir -p /app/data
chown 1001:1001 /app/data
for f in /app/data/desk.db /app/data/desk.db-wal /app/data/desk.db-shm; do
  if [ -e "$f" ]; then
    chown 1001:1001 "$f"
  fi
done
cd /app
exec runuser -u appuser -- node server/index.js
