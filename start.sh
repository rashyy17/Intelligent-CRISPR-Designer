#!/usr/bin/env bash
# Run from pdf-rag/.  Starts everything; Ctrl+C stops everything.
echo "▶ infra (qdrant + valkey)…"
docker compose up -d

echo "▶ app processes…"
(cd bio-engine && venv/bin/python main.py) &
(cd server   && pnpm run dev:worker)       &
(cd server   && pnpm dev)                  &
(cd client   && pnpm dev)                  &

trap 'echo; echo "■ stopping…"; kill $(jobs -p) 2>/dev/null; docker compose down' INT
wait