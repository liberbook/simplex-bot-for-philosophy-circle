# Installing and operating the file bot on a Linux laptop

Two supported ways: **Docker** (recommended, everything in one folder) or
**without Docker** (systemd user services). Both talk to the real SimpleX
network through the preset relays; no server of your own is needed.

Contents: [Docker](#a-docker) · [Without Docker](#b-without-docker) ·
[What runs](#what-runs-and-where) ·
[First use](#first-use-connect-become-admin-add-the-bot-to-the-group) ·
[Day-to-day](#day-to-day-operation) · [Modify](#modify-the-configuration) ·
[Clear](#clear-the-archive-or-start-over) · [Update](#update) ·
[Troubleshooting](#troubleshooting)

---

## What runs, and where

The bot is **two processes**, whatever the installation method:

```
 your SimpleX app / group members                 SimpleX network
 (phones, desktops)  ◀──── e2e encrypted ────▶  SMP relays (messages)
                                                XFTP relays (files)
                                                       ▲
                                                       │ TLS, your keys stay local
 ┌─────────────────────────────────────────────────────┼──────────────────────────┐
 │ your laptop                                         │                          │
 │  ┌──────────────────────────────┐   WebSocket   ┌───┴──────────────────────┐   │
 │  │ 2. spinoza (Node.js)         │◀─ localhost ─▶│ 1. simplex-chat CLI      │   │
 │  │  decides: which files to     │  JSON API     │  the bot's identity:     │   │
 │  │  keep, who may get them,     │               │  keys, contacts, groups, │   │
 │  │  answers commands            │               │  sends/receives files    │   │
 │  └──────────────┬───────────────┘               └──────┬───────────────────┘   │
 │                 │ reads / deletes                      │ writes downloads       │
 │                 ▼                                      ▼                        │
 │   state/  admins.json, address.txt           files/ (the archive)   db/  tmp/   │
 └────────────────────────────────────────────────────────────────────────────────┘
```

1. **`simplex-chat`**, the official terminal client, started headless with
   `-p 5225`. It *is* the bot as far as SimpleX is concerned: it holds the
   private keys and the chat database (`db/`), talks to the relays, receives
   the messages of the group, and downloads/uploads files into `files/`. It
   exposes its command API on a WebSocket bound to localhost only. It has no
   logic of its own; it does what it is told.
2. **`spinoza`**, the Node.js program in this repository. It connects to that
   WebSocket, listens to events (new messages, file offers, invitations) and
   issues commands (accept this file, send this text, join this group). All
   decisions live here: the trigger word, the storage limit, who is admin,
   who may download. It keeps its small state in `state/` and reads the
   archive folder to answer `/files`, `/get`, `/delete`.

The two processes must run on the same machine (the CLI accepts local
connections only) and exactly one program may be connected to the CLI at a
time. Stopping the bot process alone is harmless: the CLI keeps receiving,
and the bot catches up on marked files when it starts again. Stopping the
CLI means the bot is offline in SimpleX (messages queue on the relays).

**Docker: 1 container** (`deploy/docker-compose.yml`) running both
processes, supervised by a small script that stops the container if either
process ends (Docker then restarts it). Everything the bot owns is in one
folder, `deploy/data`. No ports are published. The 7-container setup in
`docker/compose.yml` (two relays, three user CLIs, the bot, a test runner)
is only the automated test network and is never needed to run the bot.

**systemd: 2 user services** (`spinoza-cli.service`, `spinoza.service`),
the same two processes, started at login (or at boot with `enable-linger`).

The bot's display name in SimpleX is **spinoza** by default (`BOT_NAME` in
`deploy/.env`, or `--create-bot-display-name` in the unit file). It is set
when the profile is created on the first start; to rename an existing bot
see [Modify the configuration](#modify-the-configuration).

---

## A. Docker

Prerequisites: Docker with the compose plugin (`docker compose version`), git.

```bash
git clone https://github.com/liberbook/simplex-bot-for-philosophy-circle.git spinoza && cd spinoza/deploy
mkdir -p data && cp spinoza.example.json data/spinoza.json
```

1. Edit `deploy/data/spinoza.json` (your copy; it is not tracked by git):
   - `group`: the name of your group exactly as it is called in SimpleX
     (glob patterns like `Team*` are allowed);
   - `adminSecret`: a long random secret (e.g. `openssl rand -hex 16`) - the
     first admin will send it to the bot;
   - `maxStorage`: archive limit, default `100gb`;
   - `trigger`: the word that asks for a group file (`conatus`): the bot posts it again in the group and sends it privately; every file is kept anyway.
2. Build and start. The image downloads the official `simplex-chat` binary
   from GitHub releases during the build (to use a binary you already have
   instead, run `../docker/cli/fetch-cli.sh` first; it copies
   `~/.local/bin/simplex-chat` into the build folder):

   ```bash
   docker compose up -d --build
   docker compose logs -f            # Ctrl-C to stop following
   ```

   The log shows `bot address: https://smp...` - that is the link people use
   to chat with the bot. It is also written to `deploy/data/state/address.txt`
   (with `"publicAddress": false`: a one-time link in `state/invite.txt`).

Folder layout after the first start:

```
deploy/data/
  spinoza.json          settings (paths and server are fixed inside the container)
  db/                   the bot's SimpleX database (its identity!)
  files/                the archive (flat; class cards refer to files by name)
  deleted/              where /delete moves files (purged after deletedRetentionDays, default 30)
  state/                admins.json, address.txt / invite.txt
  tmp/                  temporary download files
```

The container runs as the unprivileged user `bot` (uid 1000) and takes
ownership of `deploy/data` on its first start.

The bot's display name (default `spinoza`) and own relays, if any, are set
in `deploy/.env` (`BOT_NAME=...`, `SERVER_ARGS=...`) before the first start.

Continue with [First use](#first-use-connect-become-admin-add-the-bot-to-the-group).

## B. Without Docker

Prerequisites: Node.js >= 22 (`node --version`), `curl`, systemd (any modern
distribution).

```bash
# 1. the SimpleX CLI (installs ~/.local/bin/simplex-chat)
curl -o- https://raw.githubusercontent.com/simplex-chat/simplex-chat/stable/install.sh | bash

# 2. the bot
mkdir -p ~/spinoza && cd ~/spinoza
git clone https://github.com/liberbook/simplex-bot-for-philosophy-circle.git app
mkdir -p archive deleted state tmp db
cp app/deploy/spinoza.host.json config.json
```

Edit `~/spinoza/config.json` (`group`, `adminSecret`, `maxStorage`, see the
Docker section for the meaning of each setting).

Install the two services. They run under your user; `enable-linger` lets
them run while you are not logged in:

```bash
mkdir -p ~/.config/systemd/user
cp app/deploy/systemd/*.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now spinoza-cli.service spinoza.service
loginctl enable-linger "$USER"
journalctl --user -u spinoza -f            # bot log; Ctrl-C to stop
```

The first line `bot address: ...` is the link people use to chat with the
bot (also in `~/spinoza/state/address.txt`).

Notes:
- The unit files assume the layout above (`~/spinoza/app`, `~/spinoza/db`,
  ...). Edit them if you change it, then `systemctl --user daemon-reload`.
- The CLI must use a **database of its own**; never point it at the database
  of the SimpleX desktop app on the same machine.
- To run by hand instead of systemd, use the two commands from the unit
  files in two terminals.

## First use: connect, become admin, add the bot to the group

The whole procedure is four steps; the group link makes the bot join by
itself.

1. **Configure** (`deploy/data/spinoza.json`, copied from
   `deploy/spinoza.example.json`; or `~/spinoza/config.json`):
   - `groupLinks`: the link of your group (in the app: group page → *Group
     link*; it looks like `https://smp15.simplex.im/g#...`). The bot joins it
     at start-up. Several links are allowed.
   - `group`: the group's name as shown in the app (`"Ethics"`, or a pattern
     like `"Ethics*"`; `"*"` = every group the bot is in).
   - `adminSecret`: a long random secret, e.g. from `openssl rand -hex 16`.
   - `language`: `ru` (default) or `en` for the bot's replies.
2. **Start**: `docker compose up -d --build` (or the systemd commands above).
   The log shows `joining #<group> via configured link` and, once the group
   let it in, `joined #<group> - watching it now`; the bot then greets the
   group and explains the trigger word, `prius` and `/spinoza`. Its profile picture is
   Spinoza's seal (`avatar` in the config to change it). If the group requires the
   owner to accept new members, accept "spinoza" in the group's member list.
3. **Connect from your SimpleX app**: open the link printed as
   `bot address: https://...` in the log (also in `state/address.txt`), or
   scan it after `qrencode -t ansiutf8 < deploy/data/state/address.txt`.
   The bot greets you with a random theorem from Spinoza's *Ethics*
   (`/ethics` explores the rest).
4. **Become admin**: send it `/admin <your adminSecret>`. Reply: "you are an
   admin now". Only admins can create invitations, add the bot to further
   groups and manage the list of admins; files, classes and reports are for
   every member of the group.

Then post a file in the group with the caption `save` - the log shows
`saving ...` and `saved: ...`.

For weekly classes, set the schedule once (any member, in the private chat):
`/class schedule tue 19:00`. From then on a post starting with
`/class` (optionally `/class 14.09 Topic`) is the homework for the next
class, files in it or replied to it are saved into `files/<date>/`, edits are
tracked, and a recording posted after the class is filed under it when it is
marked `prius`. Members use `/class` (next class), `/class list` (the lists)
and `/watch` (notifications). Reply `save` to any earlier file to archive
it as well. Members connect to the bot's address (or write `/spinoza` in
the group) and send `/files` or `/get <name>`. With `membersOnly: true`
only members of the group are served. Group owners and admins are bot
admins too when `adminGroupRoles` contains their role (default
`["owner", "admin"]`).

Alternatives to the group link: as admin send the bot `/join <group link>`,
or add it from the group's *Add members* (you must be a group owner/admin;
with an `adminSecret` set the bot accepts invitations from admins only).

Private chat commands:

| members of the group | admins |
| --- | --- |
| `/files`, `/files *.pdf` | `/invite` - one-time link for someone to chat with the bot |
| `/get <number\|name>` | `/join <group link>` - make the bot join a group |
| `/delete <number\|name>` - move a file to the deleted folder | `/admins`, `/unadmin <name>` |
| `/restore <number\|name>`, `/deleted` - bring a deleted file back / list the deleted folder | `/admin <secret>` - become admin (anyone who knows the secret) |
| `/space` - usage, limit, free disk | |
| `/status` - version, uptime, groups, storage | |
| `/class`, `/class <date>` - next / given class: homework and files | |
| `/class list` - the lists of classes; `/watch` - follow changes | |
| `/class schedule <weekday> <hh:mm>` - weekly class schedule | |
| `/?` - short help, `/??` - every command | |

Prefer not to publish an address at all? Set `"publicAddress": false`. The
bot then writes a one-time link for the first admin to `state/invite.txt`
at start-up (while there are no admins yet); afterwards admins hand out
links with `/invite`.

## Day-to-day operation

| | Docker (in `deploy/`) | systemd |
| --- | --- | --- |
| status | `docker compose ps` | `systemctl --user status spinoza spinoza-cli` |
| logs | `docker compose logs -f` (kept: 300 KB, see below) | `journalctl --user -u spinoza -f` |
| stop (disable) | `docker compose down` | `systemctl --user disable --now spinoza spinoza-cli` |
| start (enable) | `docker compose up -d` | `systemctl --user enable --now spinoza-cli spinoza` |
| restart | `docker compose restart` | `systemctl --user restart spinoza-cli spinoza` |

The bot keeps no log files of its own: both processes write to stdout, and
Docker stores that. `deploy/docker-compose.yml` limits it to three files of
100 KB (300 KB per container), so the log cannot fill the disk; older lines
are dropped. `docker compose logs --since 1h` or `--tail 100` narrows the
output. Under systemd the journal applies its own limits. The log holds
names, command kinds and file names; the admin secret is always redacted and
the text of unrecognised messages is never written. `verbose: true` (or
`SPINOZA_VERBOSE=1`) adds debug lines - useful briefly, noisy for a long run.

Stopping keeps everything (identity, archive, admins). While the bot is
down, files marked in the group are picked up at the next start (`scan`,
last 100 messages by default) as long as they are still on the relays
(about 48 hours); commands sent while it was down are not answered.

Backups: the whole `deploy/data` (Docker) or `~/spinoza/{db,archive,state}`
folder, taken while the bot is **stopped** (the database is SQLite).

## Modify the configuration

Edit `deploy/data/spinoza.json` (Docker) or `~/spinoza/config.json`, then
restart:

```bash
docker compose restart                # Docker (a restart takes a few seconds)
systemctl --user restart spinoza      # systemd: the bot process only
```

Settings and defaults: `node src/main.js --help` (or `docker compose run
--rm --entrypoint node spinoza /app/src/main.js --help`). Every setting can
also be given as an environment variable (`SPINOZA_*`); in Docker put them
under `environment:` in the compose file.

Changing the bot's **display name** after the first start:
`simplex-chat` command `/p <new name>` - easiest via a temporary interactive
CLI on the same database while the services are stopped, e.g.
`simplex-chat -d ~/spinoza/db/chat` (systemd) or, after `docker compose
stop`, `docker compose run --rm --entrypoint simplex-chat spinoza -d /data/db/chat`.

Removing an admin: `/unadmin <name>` (group owners and admins keep their
rights through their role; set `adminGroupRoles` to `[]` to stop that).

## Clear the archive or start over

**Delete a file:** as a member of the group send `/delete <number|name>`
(the number comes from the last list shown). The file moves to
the deleted folder (`data/deleted`), where `/deleted` lists it and
`/restore <name>` brings it back; files are purged from there after
`deletedRetentionDays` (default 30, `0` = never). Deleting files from the
archive folder by hand works too - the folder is the source of truth. A
file whose post was deleted for everyone in the group moves to the deleted
folder by itself ("delete for me" is not visible to the bot).

**Empty the archive, keep the identity:**

```bash
docker compose stop && rm -rf data/files/* data/deleted/* && docker compose start   # Docker
systemctl --user stop spinoza && rm -rf ~/spinoza/archive/* && systemctl --user start spinoza
```

The files under `deploy/data` belong to uid 1000 (the container's `bot`
user); if that is not your user, prefix the `rm` commands with `sudo` (only
for the Docker setup; the systemd services run as your user).

**Start over completely** (new identity: the bot leaves all groups and every
user must reconnect and be re-added):

```bash
docker compose down && rm -rf data/{db,files,deleted,state,tmp} && docker compose up -d # Docker (keeps spinoza.json)
systemctl --user stop spinoza spinoza-cli && rm -rf ~/spinoza/{db,archive,deleted,state,tmp} \
  && mkdir -p ~/spinoza/{db,archive,deleted,state,tmp} && systemctl --user start spinoza-cli spinoza
```

## Update

**Bot code** (Docker) - one script, from the repository folder on the machine
that runs the bot, or over ssh:

```bash
scripts/update-bot.sh
ssh myserver '~/spinoza/scripts/update-bot.sh'
```

It pulls the latest commit (fast-forward), keeps your `deploy/data/spinoza.json`,
runs the unit tests if Node is installed, rebuilds the image and restarts the
container, then shows the last log lines. Your workflow: commit and push
from the laptop, run the script on the server.

**Without a git remote** - copy the working tree from your laptop with rsync
and rebuild there, in one command (the target is an ssh host and a path):

```bash
scripts/deploy-rsync.sh myserver:~/spinoza             # runs the unit tests, rsyncs, rebuilds and restarts
DRY_RUN=1 scripts/deploy-rsync.sh myserver:~/spinoza   # only shows what would be copied
```

Set `DEPLOY_TARGET=myserver:~/spinoza` once in your shell to drop the argument.
It never copies `deploy/data` (your config, database, archive, admins), so
the server keeps its state; the container restarts in a few seconds and
nothing needs to be stopped beforehand.

**Bot code** (systemd):

```bash
cd ~/spinoza/app && git pull && npm test
systemctl --user restart spinoza
```

**SimpleX CLI** - one script for both setups, run from the repository:

```bash
scripts/update-cli.sh --check          # installed version vs newest release, changes nothing
scripts/update-cli.sh                  # Docker: rebuild the image with the newest release, restart
scripts/update-cli.sh 7.1.0            # ...or a specific version
scripts/update-cli.sh --host           # systemd/host: replace ~/.local/bin/simplex-chat, restart the services
```

It backs up the chat database first (`data/db.backup-<timestamp>` or
`~/spinoza/db.backup-<timestamp>`) because the CLI migrates the database on
start and migrations are not reversible; delete old backups when you are
happy with the new version. In the Docker setup the chosen version is
remembered in `deploy/.env` (`SIMPLEX_VERSION=...`), so a later
`docker compose up --build` keeps it; `SIMPLEX_VERSION=latest` is accepted too.

## Troubleshooting

- `cannot connect to ws://...` in the bot log: the CLI is not running or not
  ready yet; the bot retries every 3 s. Check the CLI logs/status.
- `no active profile`: the CLI database has no profile; start the CLI with
  `--create-bot-display-name ...` (the unit files and compose do this).
- The bot does not join the group: the group name must match `group`, and
  with an `adminSecret` set the inviting user must be an admin (`/admin
  <secret>` first). Look for `ignoring invitation` in the log.
- `Invalid cross-device link`: `--temp-folder` must be on the same
  filesystem as the archive (already the case in the provided setups).
- `cannot encode character` when saving a file with a non-ASCII name: the CLI
  runs without a UTF-8 locale. The provided image and unit file set
  `LANG=C.UTF-8`; when running the CLI by hand, export it first.
- A user is told "only members": `membersOnly` is on and they are not a
  current member of a watched group.
- Exactly one program may be connected to the CLI's WebSocket; do not attach
  another client to port 5225 while the bot runs.
- "adminSecret still has the example value": edit `spinoza.json` and set your
  own secret; the bot refuses to start with the placeholder.
- "Too many wrong secrets": a contact typed five wrong secrets; `/admin` from
  them is ignored for an hour (even with the right secret).
- The image build fails with "checksum mismatch": the downloaded CLI binary is
  not the pinned release; use `scripts/update-cli.sh <version> --sha256 <hex>`
  to move to a release you verified.
- Docker: the container stops when either process ends and Docker restarts
  it; `docker compose logs` shows which one ended and why.
