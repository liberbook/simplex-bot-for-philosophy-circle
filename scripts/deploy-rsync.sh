#!/usr/bin/env bash
# Deploy this working tree to the machine running the bot with rsync, then
# rebuild and restart the container there. No git remote needed.
#
#   scripts/deploy-rsync.sh user@host:~/spinoza          the target as an argument
#   DEPLOY_TARGET=user@host:~/spinoza scripts/deploy-rsync.sh   ...or from the environment
#   DRY_RUN=1 scripts/deploy-rsync.sh user@host:~/spinoza       show what would be copied, change nothing
#
# Not copied: .git, node_modules, the CLI binary cache, local archives and,
# most importantly, deploy/data (config, database, files, admins on the server).
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:-${DEPLOY_TARGET:-}}"
[ -n "$TARGET" ] || { echo "usage: scripts/deploy-rsync.sh host:path  (or set DEPLOY_TARGET)"; exit 1; }
case "$TARGET" in
  *:*) ;;
  *) [ "${DRY_RUN:-0}" = "1" ] || { echo "target must be host:path (got '$TARGET')"; exit 1; } ;;
esac
HOST="${TARGET%%:*}"
DIR="${TARGET#*:}"
case "$DIR" in *[';&|$`"\ ']*) echo "unsafe characters in remote path: $DIR"; exit 1 ;; esac
BUILD_INFO="$(git rev-parse --short HEAD 2>/dev/null || echo rsync)"

echo "== unit tests"
node --test "test/unit/*.test.js" >/dev/null 2>&1 && echo "ok" || { echo "unit tests FAILED - not deploying"; exit 1; }

echo "== rsync -> $TARGET"
RSYNC_OPTS=(-az --delete --info=stats1 --exclude .git --exclude node_modules --exclude archive --exclude 'docker/cli/bin/simplex-chat' --exclude 'deploy/data' --exclude '.DS_Store')
if [ "${DRY_RUN:-0}" = "1" ]; then RSYNC_OPTS+=(-n --info=name1); else RSYNC_OPTS+=(--info=name0); fi
rsync "${RSYNC_OPTS[@]}" ./ "$TARGET/"

[ "${DRY_RUN:-0}" = "1" ] && { echo "== dry run: not restarting"; exit 0; }
echo "== rebuilding and restarting on $HOST"
# shellcheck disable=SC2029  # DIR is meant to expand on the remote side (~)
# $DIR is deliberately unquoted so that a leading ~ expands on the remote side;
# it was checked above to contain no spaces or shell metacharacters.
ssh "$HOST" "cd $DIR/deploy && BUILD_INFO='$BUILD_INFO' docker compose up -d --build && docker compose logs --tail 15"
