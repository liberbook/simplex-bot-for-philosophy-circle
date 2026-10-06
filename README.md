# spinoza

**English** · [Русский](README.ru.md) · [Українська](README.uk.md)

[![tests](https://github.com/liberbook/simplex-bot-for-philosophy-circle/actions/workflows/test.yml/badge.svg)](https://github.com/liberbook/simplex-bot-for-philosophy-circle/actions/workflows/test.yml)
[![License: AGPL v3+](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)
![Node >= 22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)
![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen.svg)
[![SimpleX Chat](https://img.shields.io/badge/SimpleX-Chat-0053d0)](https://simplex.chat)
![Docker](https://img.shields.io/badge/runs%20in-Docker-2496ed?logo=docker&logoColor=white)
![Languages](https://img.shields.io/badge/languages-en%20%C2%B7%20ru%20%C2%B7%20uk%20%C2%B7%20it-8a5a00)
[![Ethica Explorer](https://img.shields.io/badge/read%20the%20Ethics-Ethica%20Explorer-2a78d6)](https://liberbook.github.io/ethica-explorer/)

A [SimpleX Chat](https://simplex.chat) bot for a philosophy circle. It keeps the
files a group shares, runs the weekly meeting and its schedule, holds polls, and
answers questions about Spinoza's *Ethics*. Node >= 22, no npm dependencies,
self-hosted, end-to-end encrypted like every SimpleX chat.

Made for book clubs, seminars and study groups: the scan, the handout and the
recording of every meeting stay in one place, the next meeting is on the card
everybody can see, and nobody has to scroll a year of chat to find a file.

```text
 group #ethics                         private chat with the bot
 ─────────────────────────────         ────────────────────────────────
 any file          kept, silently      /files            the archive
 conatus (reply)   ──► the file  ──►   /get 3            send me that one
 prius  (under a recording)            /class            the next meeting
 /spinoza          help, privately     /class schedule sat 12:15
 /spinoza class 19.09 Substance        /vote  /ethics  /watch
```

In the group the bot is a quiet participant: it keeps every file without a word,
ties a post to a meeting, and answers one line at a time. Everything else - lists,
downloads, moving a class, drafting a poll - happens in the private chat.
Ordinary talk is never answered, even when it contains the trigger word; asked
for a file with `conatus`, the bot posts the file again as a reply, with one short
line that it is in your private chat too, and sends it there.

## What it does

| | |
| --- | --- |
| **Files** | keeps every file posted in the group, silently; the trigger word (`conatus`) as a reply to a file posts it again in the group and sends it to you privately; lists them, sends one back by number or name, moves deleted ones to a bin for 30 days, watches the size limit |
| **Meetings** | one card per meeting: date, topic, homework, readings and the recording; a weekly rule, a move, a cancellation, and a reminder in the group before it starts |
| **Polls** | drafted privately, published as one message in the group, voted with reactions; open until the author closes them or 8 days pass without a vote, or until a deadline set with `--days` |
| **Ethics** | opens any passage by its identifier, searches the text, shows the structure of a part - the corpus is the Russian translation of the *Ethics* |

Every command with the answer it really produces is in
[INTERFACE.md](INTERFACE.md) (generated from the code). How each feature works
and where it lives: [FEATURES.md](FEATURES.md). The layers and the module map:
[ARCHITECTURE.md](ARCHITECTURE.md).

Only need the files and the polls? [conatus](https://github.com/liberbook/simplex-bot-for-reading-circle) is the small sibling:
it keeps every file, hands one back on a word and runs polls - nothing else.

## Running it

```bash
cd deploy
mkdir -p data && cp spinoza.example.json data/spinoza.json   # group, language, trigger, limit
docker compose up -d --build
docker compose logs -f      # the bot's address: `address: https://…` (also in data/state/address.txt)
```

Connect to that address from a SimpleX app, then invite the bot to your group -
only an admin of the bot may do that. Step by step, including relays of your
own and updates: [INSTALL.md](INSTALL.md). Security notes: [SECURITY.md](SECURITY.md).

## Settings

`spinoza.json` next to the bot (or `--config`), `SPINOZA_*` environment
variables, command-line flags; later wins. `node src/main.js --help` lists all
of them.

| key | default | meaning |
| --- | --- | --- |
| `group` | `*` | which groups to serve (glob) |
| `trigger` | `conatus` | the word that, as a reply to a file (or right after it), posts the file again in the group and sends it privately; every file is kept anyway |
| `language` | `en` | `en`, `ru`, `uk`, `it` - the language of everything the bot says |
| `timezone` | `Europe/Moscow` | the time zone of the schedule |
| `adminSecret` | none | `/admin <secret>` makes a member an admin of the bot |
| `maxStorage` | `100gb` | archive size limit |
| `membersOnly` | `true` | serve files only to members of the group |
| `reminderMinutes` | `30` | remind the group this long before a meeting, `0` = off |

## Languages

Everything the bot says lives in one file per language in
[src/i18n/](src/i18n/): [en.js](src/i18n/en.js) is the template, and
[ru.js](src/i18n/ru.js), [uk.js](src/i18n/uk.js), [it.js](src/i18n/it.js) have
exactly the same keys.

To add a language: copy `en.js`, translate the values, then import it in
[src/bot/replies.js](src/bot/replies.js) and add it to the map there. Nothing
else in the code names a language, and `npm test` then checks your file for
missing keys and unrendered texts.

Commands are not translated: `/files`, `/class`, `/vote`, `/ethics` and their
Russian forms (`/файлы`, `/занятие`, `/голосование`, `/этика`, `/ф /з /г /э`)
are parsed whatever language the bot answers in. The *Ethics* corpus is the
Russian translation, so those passages stay Russian in every language.

The text comes from [Ethica Explorer](https://liberbook.github.io/ethica-explorer/) ([source](https://github.com/liberbook/ethica-explorer)): the whole *Ethics* in an
interactive page where every reference Spinoza makes opens in place, with full proof chains and a
map of all dependencies. Its build checks every reference against the 1677 Latin and exports the
corpus the bot uses (`data/spinoza_ethica_index_ru.json`).

## Tests

```bash
npm test           # unit tests, node:test, ~1 s (a fake gateway instead of the network)
npm run test:e2e   # the whole scenario in Docker (~4 min): local relays, three users, the bot image
node scripts/interface-doc.js   # regenerates INTERFACE.md from the code
```

## License

[GNU AGPL v3 or later](LICENSE). Copyright (C) 2026 spinoza bot contributors.
Free software: you may use, study, share and change it, and anyone you pass it
on to - or who uses your modified copy over a network - gets the same freedoms
and the source. Not affiliated with SimpleX Chat; the bot runs as a client of
the official `simplex-chat` CLI. The Russian text of Spinoza's *Ethics* in
`data/` is the translation by N. A. Ivantsov, in the public domain, checked and
completed in [Ethica Explorer](https://github.com/liberbook/ethica-explorer).
