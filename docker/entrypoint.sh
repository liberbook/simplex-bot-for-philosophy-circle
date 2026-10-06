#!/bin/bash
# Runs the two processes of the bot in one container and stops when either
# ends (so the container restarts as a whole under `restart: unless-stopped`).
# Starts as root only to give /data to the `bot` user, then re-executes itself
# unprivileged.
#
# /data (mount it):  spinoza.json  settings (optional; env SPINOZA_* work too)
#                    db/  files/  deleted/  state/  tmp/   created here
# Env: BOT_NAME          display name, used when the profile is created on the first start
#      SERVER_ARGS       extra CLI args, e.g. "-s smp://... --xftp-server xftp://..." for own relays
#      USE_LOCAL_RELAYS  =1 in the test network: use only the relays whose fingerprints are in /relays
set -euo pipefail
DIRS=(db files deleted state tmp)

if [ "$(id -u)" = "0" ]; then
  for d in "${DIRS[@]}"; do mkdir -p "/data/$d"; done
  # hand the data folder to the unprivileged user (once; later files are created by it)
  for d in /data "${DIRS[@]/#//data/}"; do
    [ "$(stat -c %u "$d")" = "1000" ] || chown -R bot:bot "$d"
  done
  exec setpriv --reuid=bot --regid=bot --init-groups "$0" "$@"
fi

RELAY_ARGS=""
if [ "${USE_LOCAL_RELAYS:-0}" = "1" ]; then
  while [ ! -s /relays/smp/fingerprint ] || [ ! -s /relays/xftp/fingerprint ]; do sleep 1; done
  RELAY_ARGS="-s smp://$(tr -d '\n' < /relays/smp/fingerprint)@${SMP_HOST:-smp.test}:5223 \
              --xftp-server xftp://$(tr -d '\n' < /relays/xftp/fingerprint)@${XFTP_HOST:-xftp.test}:443"
fi
CONFIG_ARGS=""
[ -f /data/spinoza.json ] && CONFIG_ARGS="--config /data/spinoza.json"

# The CLI echoes every command it receives (with non-ASCII text as escape
# codes); drop that chatter so `docker compose logs` shows the bot's log. The
# filter runs in a process substitution, so $! is the CLI itself and receives
# our SIGTERM; when the CLI exits the filter gets EOF and ends.
# shellcheck disable=SC2086  # word splitting of the *_ARGS strings is intended
simplex-chat -p 5225 -d /data/db/chat --files-folder /data/files --temp-folder /data/tmp -y \
  --create-bot-display-name "${BOT_NAME:-spinoza}" --create-bot-allow-files ${RELAY_ARGS} ${SERVER_ARGS:-} \
  > >(grep --line-buffered -v -E '^(received command "|client connected$|Current user: )' | sed -u 's/^/cli: /') 2>&1 &
CLI=$!
# paths inside the container are fixed; they override the config file
# shellcheck disable=SC2086
node /app/src/main.js ${CONFIG_ARGS} --server ws://127.0.0.1:5225 --dir /data/files --deleted-dir /data/deleted --state-dir /data/state &
BOT=$!

stop() { kill "$CLI" "$BOT" 2>/dev/null || true; }
trap stop TERM INT
wait -n "$CLI" "$BOT" || true
echo "a process ended, stopping the container"
stop
wait || true
