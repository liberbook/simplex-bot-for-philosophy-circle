#!/usr/bin/env bash
# Update the bot to the latest code and restart it (Docker deployment in deploy/).
#
#   scripts/update-bot.sh              on the machine running the bot
#   ssh <host> '~/spinoza/scripts/update-bot.sh'    from anywhere else
#
# Steps: git pull (fast-forward only), keep the live config, rebuild the image,
# restart the container, show the last log lines. The chat database, archive
# and admins are in deploy/data and are not touched. DRY_RUN=1 skips Docker.
set -euo pipefail
cd "$(dirname "$0")/.."
LIVE=deploy/data/spinoza.json

echo "== pulling"
git pull --ff-only || { echo "pull failed - local commits? resolve with git, nothing was deployed"; exit 1; }
if [ ! -f "$LIVE" ]; then
  mkdir -p deploy/data; cp deploy/spinoza.example.json "$LIVE"
  echo "created $LIVE from the example - edit it (group link, secret) and rerun"; exit 1
fi

if command -v node >/dev/null 2>&1; then
  echo "== unit tests"; node --test "test/unit/*.test.js" >/dev/null 2>&1 && echo "ok" || { echo "unit tests FAILED - not deploying"; exit 1; }
fi

if [ "${DRY_RUN:-0}" = "1" ]; then echo "== dry run: skipping docker compose up -d --build"; exit 0; fi
echo "== rebuilding and restarting"
export BUILD_INFO="$(git rev-parse --short HEAD)"
cd deploy
docker compose up -d --build
echo "== running: $(git -C .. rev-parse --short HEAD)"
docker compose logs --tail 15
