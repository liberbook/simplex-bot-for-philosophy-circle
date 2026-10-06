#!/usr/bin/env node
// spinoza bot - a SimpleX Chat bot for a philosophy circle
// Copyright (C) 2026 spinoza bot contributors
//
// This program is free software: you can redistribute it and/or modify it under
// the terms of the GNU Affero General Public License as published by the Free
// Software Foundation, either version 3 of the License, or (at your option) any
// later version. It comes with ABSOLUTELY NO WARRANTY; see the GNU AGPL
// <https://www.gnu.org/licenses/> and the LICENSE file for details.
// Composition root: builds the object graph and runs the bot.
import fs from "node:fs"
import path from "node:path"
import {parseConfig, USAGE} from "./config.js"
import {Logger} from "./util/logger.js"
import {redactSecrets} from "./util/redact.js"
import {ChatConnection} from "./transport/ChatConnection.js"
import {SimplexClient} from "./transport/SimplexClient.js"
import {FolderFileStore} from "./storage/FolderFileStore.js"
import {Outbox} from "./storage/Outbox.js"
import {AdminRegistry} from "./storage/AdminRegistry.js"
import {TriggerWord} from "./bot/TriggerWord.js"
import {Courier} from "./bot/Courier.js"
import {PrivateLine} from "./bot/PrivateLine.js"
import {WatchedGroups} from "./bot/WatchedGroups.js"
import {GroupMembersOnly, OpenAccess} from "./bot/AccessPolicy.js"
import {AdminPolicy} from "./bot/AdminPolicy.js"
import {StorageQuota} from "./bot/StorageQuota.js"
import {RateLimiter} from "./bot/RateLimiter.js"
import {Throttle} from "./bot/Throttle.js"
import {Archivist} from "./bot/Archivist.js"
import {Librarian} from "./bot/Librarian.js"
import {Administrator} from "./bot/Administrator.js"
import {GroupDesk} from "./bot/GroupDesk.js"
import {Philosopher} from "./bot/Philosopher.js"
import {Greeter} from "./bot/Greeter.js"
import {ContactBook} from "./bot/ContactBook.js"
import {SessionStore} from "./storage/SessionStore.js"
import {flattenArchive} from "./storage/flattenArchive.js"
import {SubscriberStore} from "./storage/SubscriberStore.js"
import {Notifier} from "./bot/Notifier.js"
import {Curator} from "./bot/Curator.js"
import {Syllabus} from "./bot/Syllabus.js"
import {ScheduleDesk} from "./bot/ScheduleDesk.js"
import {ClassDesk} from "./bot/ClassDesk.js"
import {Confirmations} from "./bot/Confirmations.js"
import {ConfirmDesk} from "./bot/ConfirmDesk.js"
import {Reminder} from "./bot/Reminder.js"
import {Listings} from "./bot/Listings.js"
import {UnknownCommands} from "./bot/UnknownCommands.js"
import {PollStore} from "./storage/PollStore.js"
import {PollBoard} from "./bot/PollBoard.js"
import {PollDesk} from "./bot/PollDesk.js"
import {createReplies} from "./bot/replies.js"
import {EthicaIndex} from "./ethics/EthicaIndex.js"
import {Citations} from "./ethics/Citations.js"
import {Bot} from "./bot/Bot.js"

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const expandHome = (p) => (process.env.HOME && p.startsWith("~/") ? path.join(process.env.HOME, p.slice(2)) : p)

let config
try {
  config = parseConfig(process.argv.slice(2), process.env)
} catch (e) {
  console.error(`error: ${e.message}\n`)
  console.error(USAGE)
  process.exit(2)
}
if (config.help) {
  console.log(USAGE)
  process.exit(0)
}

const logger = new Logger({verbose: config.verbose, redact: redactSecrets})
let replies
try {
  replies = createReplies(config.language, {triggerWord: config.trigger})
} catch (e) {
  console.error(`error: ${e.message}`)
  process.exit(2)
}
const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"))
const about = {version: `${pkg.version}${process.env.SPINOZA_BUILD ? ` (${process.env.SPINOZA_BUILD})` : ""}`, startedAt: Date.now()}
logger.info(`spinoza ${about.version}`)
for (const note of config.notes) logger.warn(note)

const ethica = EthicaIndex.load(path.join(PROJECT_ROOT, "data", "spinoza_ethica_index_ru.json"))
const citations = Citations.load(path.join(PROJECT_ROOT, "data", "spinoza_citations.json"))
const gateway = new SimplexClient(new ChatConnection(config.server, {logger}))
const store = new FolderFileStore(config.dir)
const deleted = new FolderFileStore(config.deletedDir)
const outbox = new Outbox(path.join(store.dir, ".outbox")) // inside the archive (a hidden folder no listing shows): the same filesystem, so copies are hard links
outbox.ensure()
store.ensure()
deleted.ensure()
const registry = new AdminRegistry(path.join(config.stateDir, "admins.json"))
const groups = new WatchedGroups(gateway, config.group)
const admins = new AdminPolicy({registry, gateway, groups, groupRoles: config.adminGroupRoles, secret: config.adminSecret})
const quota = new StorageQuota(store, config.maxStorageBytes)
const access = config.membersOnly ? new GroupMembersOnly(gateway, groups) : new OpenAccess()
const throttle = new Throttle({gateway, replies, logger, limiter: new RateLimiter({limit: config.rateLimit > 0 ? config.rateLimit : Infinity, windowMs: 60_000})})
const sessions = new SessionStore(path.join(config.stateDir, "sessions.json"), {timezone: config.timezone})
flattenArchive({store, deleted, sessions, logger}) // migrates archives with one folder per class
const subscribers = new SubscriberStore(path.join(config.stateDir, "subscribers.json"))
const notifier = new Notifier({gateway, subscribers, replies, logger, delayMs: config.notifyDelaySeconds * 1000})
const archivist = new Archivist({gateway, groups, quota, store, deleted, logger, rule: new TriggerWord(config.trigger)})
const listings = new Listings()
const contacts = new ContactBook({gateway, logger, onForget: [(contactId) => subscribers.set({contactId, name: ""}, false), (contactId) => registry.remove(contactId)]})
const line = new PrivateLine({gateway, contacts, logger})
const courier = new Courier({gateway, archivist, store, outbox, line, replies, logger})
contacts.onForget.push((contactId) => courier.forget(contactId))
const unknown = new UnknownCommands()
const reminder = new Reminder({gateway, groups, sessions, replies, logger, leadMs: config.reminderMinutes * 60_000})
const confirmations = new Confirmations()
const scheduleDesk = new ScheduleDesk({sessions, confirmations, replies, logger, timezone: config.timezone, reminder})
const classDesk = new ClassDesk({gateway, groups, sessions, notifier, confirmations, reminder, replies, logger})
const polls = new PollStore(path.join(config.stateDir, "polls.json"))
const pollBoard = new PollBoard({gateway, polls, replies, logger, timezone: config.timezone})

const bot = new Bot({
  gateway,
  groups,
  admins,
  logger,
  replies,
  throttle,
  archivist,
  courier,
  outbox,
  librarian: new Librarian({gateway, store, outbox, access, admins, listings, unknown, citations, replies, logger}),
  administrator: new Administrator({gateway, store, deleted, access, listings, unknown, admins, quota, groups, replies, logger, about, sessions, retentionMs: config.deletedRetentionDays * 24 * 3_600_000}),
  curator: new Curator({gateway, archivist, store, sessions, notifier, scheduleDesk, groups, replies, logger}),
  syllabus: new Syllabus({gateway, sessions, subscribers, access, scheduleDesk, classDesk, listings, replies, logger}),
  confirmDesk: new ConfirmDesk({gateway, confirmations, access, replies, logger}),
  reminder,
  pollBoard,
  pollDesk: new PollDesk({gateway, polls, board: pollBoard, groups, confirmations, access, admins, replies, logger, timezone: config.timezone}),
  groupDesk: new GroupDesk({gateway, groups, citations, contacts, admins, replies, logger, line}),
  contacts,
  philosopher: new Philosopher({gateway, index: ethica, replies, logger}),
  greeter: new Greeter({gateway, citations, access, replies, logger}),
  options: {
    filesDir: store.dir,
    stateDir: config.stateDir,
    scanCount: config.scan,
    publicAddress: config.publicAddress,
    groupLinks: config.groupLinks,
    avatarFile: config.avatar ? path.resolve(PROJECT_ROOT, expandHome(config.avatar)) : null,
  },
})

logger.info(`archive: ${store.dir} (limit ${config.maxStorage}); deleted: ${deleted.dir} (kept ${config.deletedRetentionDays} days); state: ${config.stateDir}; language: ${config.language}; timezone: ${config.timezone}; Ethica entries: ${ethica.list().length}; citations: ${citations.list().length}`)
const shutdown = () => {
  logger.info("stopping")
  bot.stop()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

bot.run().catch((e) => {
  logger.error(e.message)
  process.exit(1)
})
