#!/usr/bin/env bash
# Updates the simplex-chat CLI used by the bot.
#
#   scripts/update-cli.sh --check              show installed vs newest release, change nothing
#   scripts/update-cli.sh [VERSION]            Docker deployment (deploy/): rebuild the image with
#                                              VERSION (default: newest release) and restart the container
#   scripts/update-cli.sh --host [VERSION]     host install: replace ~/.local/bin/simplex-chat (or
#                                              $SIMPLEX_BIN) and restart the systemd user services if present
#   --sha256 <hex>                             expected checksum of the release binary (Docker build verifies it)
#   --no-verify                                accept an unverified download for a version without a known checksum
#
# The chat database is backed up first (data/db -> data/db.backup-<timestamp>, or
# ~/spinoza/db -> ~/spinoza/db.backup-<timestamp>): the CLI migrates the database
# on start and migrations are not reversible.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="simplex-chat/simplex-chat"
ASSET="simplex-chat-ubuntu-24_04-x86_64"

mode="docker"; check=0; version=""; sha256=""; verify=1
while [ $# -gt 0 ]; do
  case "$1" in
    --check) check=1 ;;
    --host) mode="host" ;;
    --sha256) shift; sha256="$1" ;;
    --no-verify) verify=0 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) version="${1#v}" ;;
  esac
  shift
done
[ -z "$version" ] || [[ "$version" =~ ^[0-9][0-9A-Za-z.-]*$ ]] || { echo "invalid version '$version'"; exit 1; }
[ -z "$sha256" ] || [[ "$sha256" =~ ^[0-9a-f]{64}$ ]] || { echo "invalid --sha256"; exit 1; }
DEFAULT_VERSION="$(sed -n 's/^ARG SIMPLEX_VERSION=//p' "$ROOT/docker/Dockerfile")"
DEFAULT_SHA256="$(sed -n 's/^ARG SIMPLEX_SHA256=//p' "$ROOT/docker/Dockerfile")"

newest() { # newest non-prerelease version, e.g. 7.0.2
  curl -fsSL --max-time 20 "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p'
}
latest="$(newest || true)"
[ -n "$latest" ] || { echo "cannot query GitHub for the newest release (offline?)"; [ -n "$version" ] || exit 1; }
target="${version:-$latest}"

if [ "$mode" = "docker" ]; then
  cd "$ROOT/deploy"
  image="$(docker compose config --images spinoza 2>/dev/null | head -1)"
  if docker image inspect "$image" >/dev/null 2>&1; then
    installed="$(docker run --rm --entrypoint simplex-chat "$image" --version 2>/dev/null | head -1)"
  else
    installed="not built"
  fi
  echo "installed: $installed"
  echo "newest release: v${latest:-?}   target: v$target"
  [ "$check" = 1 ] && exit 0
  if [ -f ../docker/cli/bin/simplex-chat ]; then
    echo "note: removing locally provided ../docker/cli/bin/simplex-chat so the release is downloaded"
    rm -f ../docker/cli/bin/simplex-chat
  fi
  if [ -d data/db ]; then
    backup="data/db.backup-$(date +%Y%m%d-%H%M%S)"
    docker compose stop >/dev/null
    cp -a data/db "$backup" && echo "database backed up to deploy/$backup"
  fi
  if [ -z "$sha256" ] && [ "$target" = "$DEFAULT_VERSION" ]; then sha256="$DEFAULT_SHA256"; fi
  if [ -z "$sha256" ] && [ "$verify" = 1 ]; then
    echo "no known checksum for v$target: pass --sha256 <hex> (compute it from a download you trust) or --no-verify"; exit 1
  fi
  export SIMPLEX_VERSION="$target" SIMPLEX_SHA256="$sha256"
  docker compose build --pull
  docker compose up -d
  echo "now running: $(docker compose exec -T spinoza simplex-chat --version | head -1)"
  echo "remembering SIMPLEX_VERSION/SIMPLEX_SHA256 in deploy/.env so later 'docker compose up --build' uses the same version"
  touch .env
  for kv in "SIMPLEX_VERSION=$target" "SIMPLEX_SHA256=$sha256"; do
    key="${kv%%=*}"
    if grep -q "^$key=" .env; then sed -i "s|^$key=.*|$kv|" .env; else echo "$kv" >> .env; fi
  done
else
  bin="${SIMPLEX_BIN:-$HOME/.local/bin/simplex-chat}"
  installed="$([ -x "$bin" ] && "$bin" --version 2>/dev/null | head -1 || echo 'not installed')"
  echo "installed: $installed ($bin)"
  echo "newest release: v${latest:-?}   target: v$target"
  [ "$check" = 1 ] && exit 0
  units_active=0
  systemctl --user is-active --quiet spinoza-cli.service 2>/dev/null && units_active=1
  if [ "$units_active" = 1 ]; then systemctl --user stop spinoza.service spinoza-cli.service; fi
  if [ -d "$HOME/spinoza/db" ]; then
    backup="$HOME/spinoza/db.backup-$(date +%Y%m%d-%H%M%S)"
    cp -a "$HOME/spinoza/db" "$backup" && echo "database backed up to $backup"
  fi
  mkdir -p "$(dirname "$bin")"
  curl -fL -sS --retry 3 -o "$bin.new" "https://github.com/$REPO/releases/download/v$target/$ASSET"
  [ -z "$sha256" ] && [ "$target" = "$DEFAULT_VERSION" ] && sha256="$DEFAULT_SHA256"
  if [ -n "$sha256" ]; then echo "$sha256  $bin.new" | sha256sum -c - || { rm -f "$bin.new"; echo "checksum mismatch - not installed"; exit 1; }
  elif [ "$verify" = 1 ]; then rm -f "$bin.new"; echo "no known checksum for v$target: pass --sha256 <hex> or --no-verify"; exit 1
  else echo "WARNING: installing an unverified binary (sha256 $(sha256sum "$bin.new" | cut -d' ' -f1))"; fi
  chmod +x "$bin.new" && mv -f "$bin.new" "$bin"
  echo "now installed: $("$bin" --version | head -1)"
  if [ "$units_active" = 1 ]; then systemctl --user start spinoza-cli.service spinoza.service; echo "services restarted"; fi
fi
