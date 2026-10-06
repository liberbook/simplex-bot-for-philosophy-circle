#!/usr/bin/env node
// Generates INTERFACE.md: every command of the bot with the answer it really
// produces. The bot's own classes run against the test gateway on a fixed
// clock and seeded state, so the document cannot drift from the code.
//
//   node scripts/interface-doc.js            -> writes INTERFACE.md in the repo root
//   node scripts/interface-doc.js /dev/stdout
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {FakeGateway} from "../test/unit/helpers.js"
import {Message} from "../src/domain/Message.js"
import {ClassSchedule} from "../src/domain/ClassSchedule.js"
import {newSession} from "../src/domain/Session.js"
import {FolderFileStore} from "../src/storage/FolderFileStore.js"
import {SessionStore} from "../src/storage/SessionStore.js"
import {SubscriberStore} from "../src/storage/SubscriberStore.js"
import {PollStore} from "../src/storage/PollStore.js"
import {AdminRegistry} from "../src/storage/AdminRegistry.js"
import {WatchedGroups} from "../src/bot/WatchedGroups.js"
import {AdminPolicy} from "../src/bot/AdminPolicy.js"
import {StorageQuota} from "../src/bot/StorageQuota.js"
import {RateLimiter} from "../src/bot/RateLimiter.js"
import {Listings} from "../src/bot/Listings.js"
import {UnknownCommands} from "../src/bot/UnknownCommands.js"
import {Confirmations} from "../src/bot/Confirmations.js"
import {ConfirmDesk} from "../src/bot/ConfirmDesk.js"
import {Notifier} from "../src/bot/Notifier.js"
import {Reminder} from "../src/bot/Reminder.js"
import {ScheduleDesk} from "../src/bot/ScheduleDesk.js"
import {ClassDesk} from "../src/bot/ClassDesk.js"
import {Syllabus} from "../src/bot/Syllabus.js"
import {Curator} from "../src/bot/Curator.js"
import {Archivist} from "../src/bot/Archivist.js"
import {Librarian} from "../src/bot/Librarian.js"
import {Administrator} from "../src/bot/Administrator.js"
import {Philosopher} from "../src/bot/Philosopher.js"
import {GroupDesk} from "../src/bot/GroupDesk.js"
import {Greeter} from "../src/bot/Greeter.js"
import {ContactBook} from "../src/bot/ContactBook.js"
import {PollBoard} from "../src/bot/PollBoard.js"
import {PollDesk} from "../src/bot/PollDesk.js"
import {TriggerWord} from "../src/bot/TriggerWord.js"
import {Courier} from "../src/bot/Courier.js"
import {PrivateLine} from "../src/bot/PrivateLine.js"
import {createReplies, DEFAULT_LANGUAGE} from "../src/bot/replies.js"
import {EthicaIndex} from "../src/ethics/EthicaIndex.js"
import {Citations} from "../src/ethics/Citations.js"
import {silentLogger} from "../src/util/logger.js"

const ROOT = path.resolve(import.meta.dirname, "..")
const NOW = new Date("2026-09-16T09:00:00Z") // Wednesday, 12:00 in Moscow
const TZ = "Europe/Moscow"
const TRIGGER = "conatus"
const SECRET = "секрет-из-настроек"
const DISK_FREE = 175 * 1024 ** 3

const GROUP = {type: "group", id: 1, name: "Ethics", title: "Ethics", memberStatus: "connected"}
const SAM = {contactId: 3, name: "sam", memberId: 2} // a member, has a private chat
const LENA = {contactId: null, name: "lena", memberId: 7} // a member, no private chat
const GUEST = {contactId: 9, name: "guest"} // not a member of the group
const DIRECT = {type: "direct", id: 3, name: "sam"}
const GUEST_CHAT = {type: "direct", id: 9, name: "guest"}

const MiB = 1024 ** 2
const ROOT_FILES = [
  ["Uno.flac", 11 * MiB, "2026-09-08"],
  ["Access to Arasaka - l a k e s - 01 EL54.flac", 38 * MiB, "2026-09-08"],
  ["Гольбах. Система природы на 12.07.26_1.pdf", Math.round(4.7 * MiB), "2026-09-07"],
  ["Гольбах. Избранные произведения, том 1.pdf", 0, "2026-09-06"],
  ["Спиноза. Этика.pdf", 3 * MiB, "2026-09-05"],
]
// files of the flat archive that class cards refer to (the class's date doubles as the file's day)
const CLASS_FILES = [
  ["2026-09-19", "Гольбах. Система природы, глава 4.pdf", Math.round(5.8 * MiB), "reading"],
  ["2026-09-19", "вопросы к главе 4.pdf", 120 * 1024, "reading"],
  ["2026-08-29", "лекция 29.08.mp3", 28 * MiB, "audio"],
  ["2026-09-05", "запись 05.09.m4a", 24 * MiB, "audio"],
]
const DELETED_FILES = [["Гольбах. Система природы на 02.08.26_2.pdf", Math.round(5.8 * MiB), "2026-09-01"]]

/** A file of the right size without writing the bytes to disk (sparse). */
function makeFile(file, size, day) {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, "")
  if (size > 0) fs.truncateSync(file, size)
  const when = new Date(`${day}T09:00:00Z`)
  fs.utimesSync(file, when, when)
}

/**
 * The whole bot on the test gateway: the same wiring of classes as in main.js,
 * but with a fixed clock, temporary folders and no network.
 */
function bench({admin = false, directMessages = true, now = NOW, language = DEFAULT_LANGUAGE} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-doc-"))
  const gateway = new FakeGateway({groups: [GROUP]})
  gateway.contacts = [{contactId: 3, name: "sam", status: "active", connStatus: "ready"}]
  if (!directMessages) gateway.memberContactError = "create member contact: commandError (direct messages not allowed)"
  const replies = createReplies(language, {triggerWord: TRIGGER})
  const clock = () => now
  const store = new FolderFileStore(path.join(dir, "files"))
  const deleted = new FolderFileStore(path.join(dir, "deleted"))
  store.ensure()
  deleted.ensure()
  for (const [name, size, day] of ROOT_FILES) makeFile(path.join(store.dir, name), size, day)
  for (const [day, name, size] of CLASS_FILES) makeFile(path.join(store.dir, name), size, day)
  for (const [name, size, day] of DELETED_FILES) makeFile(path.join(deleted.dir, name), size, day)

  const sessions = new SessionStore(path.join(dir, "state", "sessions.json"), {timezone: TZ})
  sessions.setSchedule(ClassSchedule.parse("сб 12:15", TZ))
  const session = (date, extra = {}) => sessions.save({...newSession(date, now), ...extra}, now)
  let postId = 40
  const post = (author, text, editedAt = null) => ({itemId: postId++, groupId: 1, author, text, sentAt: now.toISOString(), editedAt})
  const fileOf = (name, kind) => ({name, kind, addedAt: now.toISOString(), author: "sam"})
  for (const date of ["2026-01-10", "2026-01-17", "2026-02-07", "2026-03-14", "2026-08-15", "2026-08-22"]) session(date)
  session("2026-08-29", {topic: "Гольбах, глава 3", posts: [post("sam", "Прочитать главу 3 и выписать возражения."), post("lena", "Начнём с примечаний.")], files: [fileOf("лекция 29.08.mp3", "audio")]})
  session("2026-09-05", {files: [fileOf("запись 05.09.m4a", "audio")]})
  session("2026-09-12", {status: "cancelled", movedTo: "2026-09-19"})
  session("2026-09-19", {
    topic: "Гольбах, глава 4",
    posts: [post("sam", "Прочитать следующую главу.", "2026-09-15T10:00:00Z")],
    files: [fileOf("Гольбах. Система природы, глава 4.pdf", "reading"), fileOf("вопросы к главе 4.pdf", "reading")],
  })
  for (const date of ["2025-11-15", "2025-12-20"]) session(date)

  const groups = new WatchedGroups(gateway, "Ethics")
  const registry = new AdminRegistry(path.join(dir, "state", "admins.json"))
  const admins = {isAdmin: async () => admin, registry, promote: (contact, secret) => new AdminPolicy({registry, gateway, groups, secret: SECRET}).promote(contact, secret), mayInvite: async () => admin, describe: () => ""}
  const access = {allows: async (sender) => sender.contactId !== GUEST.contactId, describe: () => "members of the watched group only"}
  const quota = new StorageQuota({usedBytes: () => store.usedBytes(), freeDiskBytes: () => DISK_FREE}, 10 * 1024 ** 3, {clock: () => now.getTime()})
  const listings = new Listings()
  const unknown = new UnknownCommands()
  const citations = Citations.load(path.join(ROOT, "data", "spinoza_citations.json"), () => 0)
  const ethica = EthicaIndex.load(path.join(ROOT, "data", "spinoza_ethica_index_ru.json"))
  const subscribers = new SubscriberStore(path.join(dir, "state", "subscribers.json"))
  const timers = []
  const setTimer = (fn) => timers.push(fn) // the timer id is its place in the list
  const clearTimer = (id) => (timers[id - 1] = null)
  /** Only the timers set by this moment fire (otherwise a poll re-plans its own timer forever). */
  const fireTimers = async () => {
    const due = timers.map((fn, i) => [i, fn]).filter(([, fn]) => fn)
    for (const [i] of due) timers[i] = null
    for (const [, fn] of due) await fn()
  }
  const notifier = new Notifier({gateway, subscribers, replies, logger: silentLogger, setTimer, clearTimer})
  const reminder = new Reminder({gateway, groups, sessions, replies, logger: silentLogger, leadMs: 30 * 60_000, clock, setTimer: () => 1, clearTimer: () => {}})
  const confirmations = new Confirmations({clock: () => now.getTime()})
  const scheduleDesk = new ScheduleDesk({sessions, confirmations, replies, logger: silentLogger, timezone: TZ, reminder, clock})
  const classDesk = new ClassDesk({gateway, groups, sessions, notifier, confirmations, reminder, replies, logger: silentLogger, clock})
  const archivist = new Archivist({gateway, groups, quota, store, deleted, logger: silentLogger, rule: new TriggerWord(TRIGGER)})
  const curator = new Curator({gateway, archivist, store, sessions, notifier, scheduleDesk, groups, replies, logger: silentLogger, clock})
  const syllabus = new Syllabus({gateway, sessions, subscribers, access, scheduleDesk, classDesk, listings, replies, logger: silentLogger, clock})
  const confirmDesk = new ConfirmDesk({gateway, confirmations, access, replies, logger: silentLogger})
  const librarian = new Librarian({gateway, store, access, admins, listings, unknown, citations, replies, logger: silentLogger})
  const administrator = new Administrator({gateway, store, deleted, access, listings, unknown, admins, quota, groups, replies, logger: silentLogger, sessions, about: {version: "1.2.0", startedAt: now.getTime() - 3 * 3_600_000 - 12 * 60_000}, clock: () => now.getTime()})
  const philosopher = new Philosopher({gateway, index: ethica, replies, logger: silentLogger, random: () => 0.5})
  const contacts = new ContactBook({gateway, logger: silentLogger})
  const polls = new PollStore(path.join(dir, "state", "polls.json"))
  const pollBoard = new PollBoard({gateway, polls, replies, logger: silentLogger, timezone: TZ, clock, setTimer, clearTimer})
  const pollDesk = new PollDesk({gateway, polls, board: pollBoard, groups, confirmations, access, admins, replies, logger: silentLogger, timezone: TZ, clock})
  const greeter = new Greeter({gateway, citations, access, replies, logger: silentLogger, attempts: 1, sleep: async () => {}})
  const line = new PrivateLine({gateway, contacts, logger: silentLogger, clock: () => now.getTime()})
  const groupDesk = new GroupDesk({gateway, groups, citations, contacts, admins, replies, logger: silentLogger, limiter: new RateLimiter({limit: 3, windowMs: 600_000, clock: () => now.getTime()}), clock: () => now.getTime(), line})
  const courier = new Courier({gateway, archivist, store, line, replies, logger: silentLogger})

  let itemId = 100
  const route = async (message) => {
    if (message.isGroup) {
      await curator.handle(message)
      await groupDesk.handle(message)
      await archivist.handle(message)
      await courier.handle(message)
      return
    }
    if (await administrator.handle(message)) return
    if (await confirmDesk.handle(message)) return
    if (await pollDesk.handle(message)) return
    if (!(await syllabus.handle(message)) && !(await philosopher.handle(message))) await librarian.handle(message)
  }

  /** Everything the bot did while `fn` ran: messages, edits, requests for a private chat. */
  const capture = async (fn) => {
    const sent = gateway.sent.length
    const edited = gateway.edits.length
    const invited = (gateway.invitationsSent ?? []).length
    await fn()
    await new Promise((r) => setImmediate(r)) // some answers the bot sends without await (the reminder, the file confirmation)
    const out = gateway.sent.slice(sent)
    for (const edit of gateway.edits.slice(edited)) out.push({chat: edit.chat, text: edit.text, edited: true})
    for (const invitation of (gateway.invitationsSent ?? []).slice(invited)) out.push({chat: {type: "direct", name: "member"}, text: invitation.text, invitation: true})
    return out
  }

  return {
    dir, gateway, replies, store, deleted, sessions, subscribers, polls, listings, citations, quota, confirmations,
    archivist, courier, curator, syllabus, librarian, administrator, philosopher, groupDesk, greeter, pollBoard, pollDesk, reminder, notifier, scheduleDesk, classDesk,
    fireTimers,
    setAdmin: (value) => (admin = value),
    /** A private message to the bot. */
    priv: (text, {sender = SAM, chat = DIRECT} = {}) => capture(() => route(new Message({chat, sender, incoming: true, itemId: itemId++, text}))),
    /** A message in the group. */
    grp: (text, {sender = SAM, file = null, quotedItemId = null} = {}) => capture(() => route(new Message({chat: GROUP, sender, incoming: true, itemId: itemId++, text, file, quotedItemId, sentAt: now}))),
    capture,
    nextItemId: () => itemId++,
  }
}

const offer = (id, name, size) => ({id, name, size, status: "rcvInvitation", path: null, contentType: "file"})

/** The bot's answers as one block; for another chat the place of the answer is named. */
function render(entries, primary = "direct") {
  if (entries.length === 0) return "(the bot says nothing)"
  return entries
    .map((e) => {
      if (e.filePath) return `${e.chat.type === primary ? "" : e.chat.type === "group" ? `[to the group #${e.chat.name}]\n` : "[to the private chat]\n"}[the bot sends the file ${path.basename(e.filePath)}]`
      const where = e.invitation
        ? "[the first message of a new private chat]"
        : e.edited
          ? "[the bot rewrites its own earlier message in the group]"
        : e.chat.type === primary
          ? e.quotedItemId
            ? "[as a reply to the message]"
            : null
          : e.chat.type === "group"
            ? `[to the group #${e.chat.name}]`
            : "[to the private chat]"
      return where ? `${where}\n${e.text}` : e.text
    })
    .join("\n\n")
}

const out = []
const md = (...lines) => out.push(lines.join("\n"))
const h1 = (t) => md(`# ${t}`, "")
const h2 = (t) => md(`## ${t}`, "")
const h3 = (t) => md(`### ${t}`, "")
const p = (t) => md(t, "")
/** A command and its answer. */
const ex = (command, entries, {note = null, primary = "direct"} = {}) => {
  md(`**\`${command}\`**${note ? ` - ${note}` : ""}`, "", "```text", render(entries, primary), "```", "")
}
/** A ready text with no command behind it (a greeting, a reminder, an announcement). */
const shows = (title, entries, {note = null, primary = "direct"} = {}) => {
  md(`**${title}**${note ? ` - ${note}` : ""}`, "", "```text", render(entries, primary), "```", "")
}

/**
 * Builds the document and returns it. INTERFACE.md is the default language;
 * every other language renders the same 165 commands through the same classes,
 * which is how test/unit/interface.test.js smoke-tests a translation.
 */
export async function generate(language = DEFAULT_LANGUAGE) {
  out.length = 0
  const b = bench({language})
  const {replies} = b

  h1("The bot's interface: every command with its answer")
  p(
    [
      "This document is generated from the real code: the commands run through the same",
      "classes as in the bot (`scripts/interface-doc.js`), so the answers are the ones a",
      "person really sees. The examples show the default language (English); the same",
      "texts exist in every language of `src/i18n/`. Rebuild: `node scripts/interface-doc.js`.",
    ].join("\n")
  )
  p(
    [
      "The conditions of the examples:",
      "",
      "- time zone `Europe/Moscow`, \"now\" is Wednesday 16 September 2026, 12:00;",
      "- the schedule: every Saturday at 12:15; the next class is 19 September;",
      "- 12 September is cancelled, its materials moved to 19 September;",
      "- the group \"Ethics\", trigger word `conatus`, archive limit 10 GiB;",
      "- `sam` - a member with a private chat, `lena` - a member without one,",
      "  `guest` - not a member.",
    ].join("\n")
  )

  h2("Contents")
  p(
    [
      "1. [Private chat: the first message and the help](#private-chat-the-first-message-and-the-help)",
      "2. [Files](#files)",
      "3. [Classes and the schedule](#classes-and-the-schedule)",
      "4. [Polls](#polls)",
      "5. [Spinoza's Ethics](#spinozas-ethics)",
      "6. [Upkeep and rights](#upkeep-and-rights)",
      "7. [Errors and hints](#errors-and-hints)",
      "8. [Commands in the group](#commands-in-the-group)",
      "9. [What the bot sends on its own](#what-the-bot-sends-on-its-own)",
      "10. [The command menu in the app](#the-command-menu-in-the-app)",
      "11. [Short forms](#short-forms)",
      "12. [What stands out](#what-stands-out)",
    ].join("\n")
  )

  // ------------------------------------------------------------------- help
  h2("Private chat: the first message and the help")

  shows("The greeting of a group member", await b.capture(() => b.greeter.greet({contactId: 3, name: "sam"})), {note: "right after the connection"})
  shows("The greeting of someone who is not in the group", await b.capture(() => b.greeter.greet({contactId: 9, name: "guest"})))
  ex("/?", await b.priv("/?"), {note: "the short help; the words `/help`, `/помощь` work too"})
  ex("/??", await b.priv("/??"), {note: "every command by sections"})
  b.setAdmin(true)
  ex("/?? (as an admin)", await b.priv("/??"), {note: "two lines are added"})
  b.setAdmin(false)
  ex("/spinoza", await b.priv("/spinoza"), {note: "in a private chat - the personal help"})
  ex("/? (not a member)", await b.priv("/?", {sender: GUEST, chat: GUEST_CHAT}), {note: "files and classes are not shown"})

  // ------------------------------------------------------------------ files
  h2("Files")

  p("The `/файлы` section is built like `/занятие`. The canonical names stand alone: `/файлы [pattern]`, `/дай`, `/удалить`, `/корзина`, `/восстановить`, `/место`, `/файлы ?`; the same operations go through the section (`/файлы дай`) and by one letter (`/ф д`, `/ф у`, `/ф к`, `/ф в`, `/ф м`).")
  ex("/файлы", await b.priv("/файлы"), {note: "the same: `/список`, `/ф`; class files are listed with the others, a long name is shortened, an empty file is flagged"})
  ex("/файлы *.pdf", await b.priv("/файлы *.pdf"))
  ex("/д 2", await b.priv("/д 2"), {note: "a number from the last listing shown; the same: `/дай 2`"})
  ex("/дай Uno.flac", await b.priv("/дай Uno.flac"), {note: "by name"})
  ex("/файлы *.zip", await b.priv("/файлы *.zip"), {note: "nothing found"})
  ex("/ф д 2 (right after the empty filter)", await b.priv("/ф д 2"), {note: "an empty result does not disturb the numbering of the last listing"})
  ex("/дай", await b.priv("/дай"))
  ex("/дай нет.pdf", await b.priv("/дай нет.pdf"))
  ex("/дай 99", await b.priv("/дай 99"))
  ex("/дай *.pdf", await b.priv("/дай *.pdf"), {note: "more than three matches - a numbered choice"})
  ex("/удалить *.pdf", await b.priv("/удалить *.pdf"), {note: "no deletion by pattern"})
  ex("/удалить Спиноза. Этика.pdf", await b.priv("/удалить Спиноза. Этика.pdf"), {note: "the number in the hint is real: the file just deleted is the first one in the deleted list"})
  ex("/восстановить 1 (right after the deletion)", await b.priv("/восстановить 1"), {note: "it brings back exactly that file, even if the deleted list has not been shown for a long time"})
  await b.priv("/удалить Спиноза. Этика.pdf")
  ex("/корзина", await b.priv("/корзина"), {note: "the same: `/файлы корзина`, `/ф к`"})
  ex("/восстановить 1", await b.priv("/восстановить 1"))
  ex("/файлы удалить вопросы к главе 4.pdf", await b.priv("/файлы удалить вопросы к главе 4.pdf"), {note: "a class file: the class card forgets it at once, and the answer names the card"})
  ex("/занятие", await b.priv("/занятие"), {note: "without the deleted file"})
  await b.priv("/корзина")
  ex("/корзина → /ф в 1", await b.priv("/ф в 1"), {note: "the number comes from the deleted list just shown; the file returns to the class card too"})
  ex("/файлы ?", await b.priv("/файлы ?"), {note: "the same: `/ф ?`"})
  ex("/удалить", await b.priv("/удалить"))
  ex("/место", await b.priv("/место"))

  // --------------------------------------------------------------- classes
  h2("Classes and the schedule")
  p("One section `/занятие`; inside it the class card, the overviews, the schedule, a move and a cancellation. The canonical name of the overview is `/занятие список` (every hint writes it that way), short `/з с`; `/занятия` and `/дз` are still synonyms.")

  ex("/занятие", await b.priv("/занятие"), {note: "the same: `/з`, `/дз`; the files are numbered"})
  ex("/д 1 (after the card)", await b.priv("/д 1"), {note: "a number from the class card"})
  ex("/занятие 29.08", await b.priv("/занятие 29.08"), {note: "a past class"})
  ex("/занятие 12.09", await b.priv("/занятие 12.09"), {note: "a cancelled class"})
  ex("/занятие 26.09", await b.priv("/занятие 26.09"), {note: "a regular date with nothing published for it yet"})
  ex("/занятие 01.01", await b.priv("/занятие 01.01"), {note: "not a class day"})
  ex("/занятие список", await b.priv("/занятие список"), {note: "the same: `/з с`, `/занятия`"})
  ex("/занятие список 09.2026", await b.priv("/занятие список 09.2026"), {note: "a month; \"сентябрь 2026\" is understood too"})
  ex("/занятие список 2026", await b.priv("/занятие список 2026"), {note: "the months of a year"})
  ex("/занятие список архив", await b.priv("/занятие список архив"))
  ex("/занятие список завтра", await b.priv("/занятие список завтра"), {note: "an unclear period - and a hint on how to open a single class"})
  ex("/занятие расписание", await b.priv("/занятие расписание"), {note: "the same: `/расписание`, `/з р`"})
  ex("/занятие ?", await b.priv("/занятие ?"), {note: "the same: `/з ?`"})
  ex("/уведомления", await b.priv("/уведомления"))
  ex("/уведомления вкл", await b.priv("/уведомления вкл"))
  ex("/уведомления может быть", await b.priv("/уведомления может быть"))
  ex("/подтвердить", await b.priv("/подтвердить"), {note: "nothing to confirm; one word for classes and for polls"})
  ex("/отменить", await b.priv("/отменить"), {note: "nothing to drop"})

  h3("Changing the schedule")
  const sch = bench()
  ex("/занятие расписание вт 19:00", await sch.priv("/занятие расписание вт 19:00"), {note: "a preview, nothing has changed yet; the new rule leaves the class of 19.09 with its materials alone"})
  ex("/отменить", await sch.priv("/отменить"), {note: "changed their mind; the same: `/занятие отменить`"})
  await sch.priv("/занятие расписание вт 19:00")
  ex("/подтвердить", await sch.priv("/подтвердить"), {note: "after a second preview; the same: `/занятие подтвердить`"})
  ex("/занятие расписание", await sch.priv("/занятие расписание"), {note: "the new rule; the moves and cancellations are kept"})

  h3("Moving a class")
  const mv = bench()
  ex("/занятие перенос 20:00", await mv.priv("/занятие перенос 20:00"), {note: "only a time was given - the bot names the date"})
  ex("/подтвердить", await mv.priv("/подтвердить"), {note: "announced in the group; the private answer says where it was announced"})
  const mv2 = bench()
  await mv2.priv("/занятие перенос 21.09 20:00")
  ex("/занятие перенос 21.09 20:00 → /подтвердить", await mv2.priv("/подтвердить"), {note: "a move to another day: the materials (posts and file references) move with it, the files stay in the archive"})
  ex("/занятие расписание", await mv2.priv("/занятие расписание"), {note: "the move is visible among the exceptions"})
  ex("/занятие перенос", await mv2.priv("/занятие перенос"))

  h3("Cancelling a class")
  const cn = bench()
  ex("/занятие отмена", await cn.priv("/занятие отмена"), {note: "the next class"})
  ex("/подтвердить", await cn.priv("/подтвердить"))
  ex("/занятие список", await cn.priv("/занятие список"), {note: "after the cancellation"})
  ex("/занятие отмена 12.09", await cn.priv("/занятие отмена 12.09"), {note: "already cancelled"})

  // ------------------------------------------------------------------ polls
  h2("Polls")
  const pl = bench()
  ex("/голосование", await pl.priv("/голосование"), {note: "no active polls"})
  ex("/голосование Когда провести занятие? | Суббота 12:15 | Воскресенье 12:15 --дней 3", await pl.priv("/голосование Когда провести занятие? | Суббота 12:15 | Воскресенье 12:15 --дней 3"), {note: "a preview"})
  ex("/подтвердить", await pl.priv("/подтвердить"), {note: "one message is posted in the group; the same: `/голосование подтвердить`"})
  const poll = pl.polls.get(1)
  shows(
    "The message in the group after the votes",
    await pl.capture(async () => {
      await pl.pollBoard.onReaction({chat: GROUP, itemId: poll.itemId, sender: {contactId: 4, name: "lena", memberId: 7}, emoji: "👍", added: true})
      await pl.pollBoard.onReaction({chat: GROUP, itemId: poll.itemId, sender: {contactId: 5, name: "kim", memberId: 8}, emoji: "😀", added: true})
      await pl.fireTimers()
    }),
    {note: "the same message is edited, no new ones appear", primary: "group"}
  )
  ex("/голосование", await pl.priv("/голосование"), {note: "my active polls"})
  ex("/голосование 1", await pl.priv("/голосование 1"))
  ex("/г з 1", await pl.priv("/г з 1"), {note: "= /голосование закрыть 1; the group message is rewritten with the result"})
  ex("/голосование история", await pl.priv("/голосование история"))
  ex("/голосование ?", await pl.priv("/голосование ?"), {note: "the same: `/г ?`"})
  ex("/голосование Когда встретимся", await pl.priv("/голосование Когда встретимся"), {note: "no separator"})
  ex("/голосование Вопрос? | а | б --дней много", await pl.priv("/голосование Вопрос? | а | б --дней много"))

  // ----------------------------------------------------------------- ethics
  h2("Spinoza's Ethics")
  ex("/этика", await b.priv("/этика"), {note: "the practical memo"})
  ex("/этика ?", await b.priv("/этика ?"), {note: "identifiers, modes, search"})
  ex("/этика Э1т7", cut(await b.priv("/этика Э1т7"), 12, 900), {note: "the proposition and its proof"})
  ex("/э о Э1т8", cut(await b.priv("/э о Э1т8"), 8, 900), {note: "= /этика полн Э1т8: the scholia and corollaries as well; the beginning of the answer is shown below"})
  ex("/этика всё Э1т28", cut(await b.priv("/этика всё Э1т28"), 6, 700), {note: "the full text and the propositions it refers to; a long answer, split into several messages"})
  ex("/этика часть 1 теорема 7", cut(await b.priv("/этика часть 1 теорема 7"), 3, 300), {note: "a request in ordinary words"})
  ex("/этика поиск любовь часть 3", cut(await b.priv("/этика поиск любовь часть 3"), 6, 700))
  ex("/этика список 1", await b.priv("/этика список 1"), {note: "the structure of a part, not a list of propositions"})
  ex("/э с 1 теоремы", cut(await b.priv("/э с 1 теоремы"), 6), {note: "= /этика список 1 теоремы: the entries of one type with the beginning of the text"})
  ex("/этика случайно", cut(await b.priv("/этика случайно"), 4, 300), {note: "a different proposition every time"})
  ex("/этика Э7т1", await b.priv("/этика Э7т1"), {note: "no such proposition"})
  ex("/этика Э1т7кор", await b.priv("/этика Э1т7кор"), {note: "a hint with the nearest forms"})
  ex("/этика Э1т7 полная", await b.priv("/этика Э1т7 полная"), {note: "an unrecognised mode"})
  ex("/э Э1т7", cut(await b.priv("/э Э1т7"), 3, 200), {note: "the short form"})

  // ----------------------------------------------------------------- upkeep
  h2("Upkeep and rights")
  ex("/статус", await b.priv("/статус"))
  ex("/admin <secret>", await b.priv(`/admin ${SECRET}`), {note: "anyone who knows the secret can become an admin"})
  ex("/admin не-тот-секрет", await b.priv("/admin не-тот-секрет"), {note: "after five wrong tries - an hour of silence"})
  b.setAdmin(true)
  ex("/админы", await b.priv("/админы"))
  ex("/разадмин sam", await b.priv("/разадмин sam"))
  ex("/разадмин lena", await b.priv("/разадмин lena"), {note: "no such admin"})
  b.setAdmin(false)
  ex("/админы (not an admin)", await b.priv("/админы"))
  ex("/список (not a member)", await b.priv("/список", {sender: GUEST, chat: GUEST_CHAT}))
  ex("/занятие (not a member)", await b.priv("/занятие", {sender: GUEST, chat: GUEST_CHAT}))
  p("The commands `/invite` and `/join` exist for admins, but are deliberately shown neither in the help nor in the hints.")

  // ----------------------------------------------------------------- errors
  h2("Errors and hints")
  ex("/спсиок", await b.priv("/спсиок"), {note: "a typo: the nearest command is suggested"})
  ex("/x", await b.priv("/x"), {note: "one-letter forms are never passed off as the nearest command"})
  ex("/xyzzy", await b.priv("/xyzzy"), {note: "no similar command"})
  ex("привет, что ты умеешь?", await b.priv("привет, что ты умеешь?"), {note: "ordinary text - the short help"})

  // ------------------------------------------------------------------ group
  h2("Commands in the group")
  p("In the group the bot answers briefly and only to what is listed below. Everything long goes into the private chat.")
  const g = bench()
  shows("The bot has joined the group", await g.capture(() => g.groupDesk.greet(GROUP)), {primary: "group"})

  h3("Files")
  p("Every file posted in the group is kept in the archive - silently, until the post is deleted for everyone or a member deletes the file with `/удалить`. The group never hears about files; the trigger word asks for one privately.")
  const posted = await g.capture(async () => {
    const file = offer(7, "Гольбах. Система природы, глава 5.pdf", 6 * MiB)
    await g.grp("к следующему занятию", {file})
    makeFile(path.join(g.store.dir, file.name), file.size, "2026-09-16")
    g.archivist.onFileReceived({...file, path: file.name})
  })
  shows("A file posted in the group", posted, {note: "kept in the archive, nothing is said", primary: "group"})
  const kept = {...offer(7, "Гольбах. Система природы, глава 5.pdf", 6 * MiB), status: "rcvComplete", path: "Гольбах. Система природы, глава 5.pdf"}
  g.gateway.items["1:151"] = new Message({chat: GROUP, sender: LENA, incoming: true, itemId: 151, text: "", file: kept})
  ex("conatus (in reply to a file)", await g.grp("conatus", {quotedItemId: 151}), {note: "the file goes to the private chat; also as a comment right after the file, or a comment with the name of a recent file", primary: "group"})
  const fetcher = bench()
  fetcher.gateway.items["1:151"] = g.gateway.items["1:151"]
  makeFile(path.join(fetcher.store.dir, kept.name), kept.size, "2026-09-16")
  const asked = await fetcher.grp("conatus", {sender: LENA, quotedItemId: 151})
  ex("conatus (no private chat yet)", asked, {note: "the bot opens the chat; the request names the file", primary: "group"})
  shows("…and once the member accepts the chat", await fetcher.capture(() => fetcher.courier.onContactConnected({contactId: fetcher.gateway.memberContacts.at(-1).contactId, name: "lena"})), {primary: "group"})
  g.gateway.items["1:150"] = new Message({chat: GROUP, sender: LENA, incoming: true, itemId: 150, text: "просто реплика"})
  ex("conatus (in reply to a message with no file)", await g.grp("conatus", {quotedItemId: 150}), {note: "answered privately too", primary: "group"})
  g.gateway.items["1:152"] = new Message({chat: GROUP, sender: LENA, incoming: true, itemId: 152, text: "", file: {...offer(13, "старый конспект.pdf", MiB), status: "rcvComplete", path: "старый конспект.pdf"}})
  ex("conatus (the file was deleted from the archive)", await g.grp("conatus", {quotedItemId: 152}), {primary: "group"})
  const attached = await g.capture(async () => {
    const file = offer(12, "тезисы к главе 4.pdf", 2 * MiB)
    await g.grp("", {sender: LENA, file, quotedItemId: 42}) // a reply to the post of the class on 19.09 (the third post in the seed)
    makeFile(path.join(g.store.dir, file.name), file.size, "2026-09-16")
    g.archivist.onFileReceived({...file, path: file.name})
  })
  shows("A file in reply to a class post", attached, {note: "it is saved to the archive and appears on the card", primary: "group"})
  const afterClass = bench({now: new Date("2026-09-20T09:00:00Z")}) // Sunday, the day after the class
  afterClass.gateway.recent = [new Message({chat: GROUP, sender: SAM, incoming: true, itemId: 1, text: "", file: offer(8, "лекция 19.09.mp3", 20 * MiB)})]
  shows("A `prius` comment under a class recording", await afterClass.grp("prius"), {note: "the recording goes to the class that has passed (not older than a week); `prius 05.09` - to the class of that date", primary: "group"})
  g.gateway.recent = [new Message({chat: GROUP, sender: SAM, incoming: true, itemId: 1, text: "", file: offer(9, "старая запись.mp3", 12 * MiB)})]
  shows("`prius` when the last class is more than a week old", await g.grp("prius"), {note: "a date is needed", primary: "group"})
  g.gateway.recent = []

  h3("`/spinoza` - the way into a private chat")
  ex("/spinoza (a private chat exists)", await g.grp("/spinoza"), {note: "the help goes into the private chat, the group sees one line", primary: "group"})
  const lena = bench()
  ex("/spinoza (no private chat yet)", await lena.grp("/spinoza", {sender: LENA}), {note: "the bot opens the chat itself and sends the help as the first message", primary: "group"})
  const noDirect = bench({directMessages: false})
  ex("/spinoza (direct messages are off in the group)", await noDirect.grp("/spinoza", {sender: LENA}), {note: "a one-time link is left instead; asking again gives the same link", primary: "group"})
  ex("/spinoza ??", await g.grp("/spinoza ??"), {note: "the full help into the private chat", primary: "group"})
  const flood = bench()
  await flood.grp("/spinoza")
  await flood.grp("/spinoza")
  await flood.grp("/spinoza")
  ex("/spinoza (the fourth time in 10 minutes)", await flood.grp("/spinoza"), {note: "after that - silence", primary: "group"})

  h3("Classes in the group")
  ex("/spinoza расписание", await g.grp("/spinoza расписание"), {note: "the schedule can only be changed in a private chat", primary: "group"})
  ex("/spinoza расписание вт 19:00", await g.grp("/spinoza расписание вт 19:00"), {note: "in the group it only shows, with a hint where to go", primary: "group"})
  const card = bench()
  card.gateway.recent = []
  ex("/spinoza занятие", await card.grp("/spinoza занятие"), {note: "the command on its own with nothing to tie - the next class card is shown", primary: "group"})
  ex("/spinoza занятие Гольбах, глава 5\\nПрочитать главу 5.", await g.grp("/spinoza занятие Гольбах, глава 5\nПрочитать главу 5."), {note: "as the first line of a post: the text of the post becomes the homework", primary: "group"})
  ex("/spinoza занятие 26.09 Гольбах, глава 6", await g.grp("/spinoza занятие 26.09 Гольбах, глава 6"), {note: "with a date and a topic", primary: "group"})
  p("A file sent in reply to a class post is attached - it is saved quietly and appears on the card (`/занятие`); the archive stays flat, the card holds a reference.")

  h3("Private commands in the group")
  const silent = bench()
  ex("/список (in the group)", await silent.grp("/список"), {note: "every private command in the group gets the same single line; after three hints in 10 minutes - silence", primary: "group"})
  const quiet = []
  for (const text of ["/дай 1", "/этика Э1т7", "/?", "/статус"]) quiet.push(...(await silent.grp(text)))
  md(`The next \`/дай 1\`, \`/этика Э1т7\`, \`/?\`, \`/статус\` from the same member: ${quiet.length} ${quiet.length === 2 ? "hints, then silence" : "answers"}.`, "")
  const wart = bench()
  wart.gateway.recent = []
  const wartReply = await wart.grp("/занятие перенос 20:00")
  ex("/занятие перенос 20:00 (in the group)", wartReply, {note: `an operation of the class section is not carried out in the group and changes no class (the topic is still "${wart.sessions.get("2026-09-19").topic}")`, primary: "group"})
  h3("Ordinary phrases")
  const talk = bench()
  talk.gateway.recent = []
  const phrases = ["список дел на неделю", "Занятие переносится на вторник?", "Расписание пока прежнее", "Спиноза писал о conatus как о стремлении", "Задание: прочитать главу 5", "prius est quam posterius"]
  const talkOut = []
  for (const text of phrases) talkOut.push(...(await talk.grp(text)))
  md("**Members' phrases that begin with command words or contain conatus**", "", "```text", phrases.join("\n"), "```", "")
  md(`The answer: ${talkOut.length === 0 ? "the bot says nothing and sends nothing - in the group a command starts with a slash (the bare word prius aside), and conatus asks for a file only as a bare word: in reply to a file or as a comment right after it." : `the bot answers ${talkOut.length} of them (a bug)`}`, "")

  // ------------------------------------------- what the bot sends on its own
  h2("What the bot sends on its own")
  const rm = bench({now: new Date("2026-09-19T09:10:00Z")}) // 12:10 in Moscow, five minutes before the class
  shows("The reminder in the group", await rm.capture(() => rm.reminder.start()), {note: "30 minutes before the class, once", primary: "group"})
  const note = bench()
  await note.priv("/уведомления вкл")
  shows(
    "A subscriber's notification about changes",
    await note.capture(async () => {
      note.notifier.changed("2026-09-19", {kind: "post", by: "lena"})
      note.notifier.changed("2026-09-19", {kind: "file", by: "lena", name: "тезисы.pdf"})
      await note.fireTimers()
    }),
    {note: "one message per class after a pause, not one per change"}
  )
  p("The announcements of a move and of a cancellation the bot sends to the group itself - they are shown above together with the commands `/занятие перенос` and `/занятие отмена`.")

  // ------------------------------------------------------------------- menu
  h2("The command menu in the app")
  p("SimpleX shows this list under the commands button in the chat with the bot:")
  md("```text", replies.botCommandsSpec.replace(/,(?=')/g, "\n"), "```", "")

  h2("Short forms")
  p("Every section and every frequent operation is one letter (the first one): `/ф` files, `/з` class, `/г` poll, `/э` ethics, `/у` notifications, `/с` status, `/д` get, `/п` confirm, `/о` drop, `/?` help. Inside a section it is the first letter of the operation as well.")
  const sh = bench()
  ex("/з с", await sh.priv("/з с"), {note: "= /занятие список"})
  ex("/з п 20:00", await sh.priv("/з п 20:00"), {note: "= /занятие перенос 20:00"})
  ex("/о", await sh.priv("/о"), {note: "= /отменить"})
  ex("/у вкл", await sh.priv("/у вкл"), {note: "= /уведомления вкл"})
  ex("/с", await sh.priv("/с"), {note: "= /статус"})
  ex("/ф к", await sh.priv("/ф к"), {note: "= /файлы корзина"})
  ex("/э л", cut(await sh.priv("/э л"), 3, 200), {note: "= /этика случайно"})
  ex("/г и", await sh.priv("/г и"), {note: "= /голосование история"})
  ex("/ф ?", await sh.priv("/ф ?"), {note: "the section help: `?` instead of the word \"help\""})

  h2("What stands out")
  p("The rules the answers above obey - and what is still uneven:")
  p(
    [
      "1. **One confirmation.** Every preview ends with \"Confirm: /confirm\" and \"Drop: /drop\";",
      "   `/занятие подтвердить`, `/голосование отменить` are synonyms of the same two words.",
      "2. **Dates in digits.** In sentences \"19.09.2026, 12:15\", in the rows of a list \"19.09\".",
      "3. **Commands in hints** are named as in the section help: `/занятие перенос`, `/файлы дай`.",
      "4. **A report = HEADING, body, \"Label: /command\".** Every answer of a section without",
      "   arguments ends with the line \"Help: /<section> ?\" (\"Help: /class ?\").",
      "5. **The separator `·`, the ellipsis `…`, counts in words** (\"2 votes\", \"3 days\", \"30 minutes\").",
      "6. **File names as stored**, shortened when long, everywhere a person reads; the full stored name only in `/дай`.",
      "7. **In the group - only group commands**, every action is confirmed with one line,",
      "   every failure is explained with one line; any private command in the group gets one",
      "   line \"This is done in the private chat\" (rate-limited, so it never becomes noise).",
      "   Files are the exception: they are kept silently, and conatus is answered in the private chat only.",
      "9. **One name per command.** Files keep stand-alone names (`/дай`, `/удалить`, `/корзина`),",
      "   classes are `/занятие <operation>` (`/занятие список`); the help, the footers and the hints write it the same way.",
      "10. **The greeting, `/?` and `/spinoza` list the sections with one and the same block of lines.**",
      "11. **A new schedule leaves the classes that have materials alone:** they keep their own time and",
      "    are listed in the preview (\"Stays as it is\").",
      "12. **In the group a command starts with a slash.** A phrase like \"Занятие переносится…\" or \"Спиноза писал о conatus…\" is",
      "    talk: the bot says nothing and sends nothing; without a slash only conatus (as a bare word, in reply",
      "    to a file or right after it) and prius (as a bare word or with a date) work.",
      "8. **The help is `?`.** `/?` the main commands, `/??` all of them, `/<section> ?` the help of a section;",
      "   the words `help`, `помощь`, `справка` are understood but appear nowhere.",
      "",
      "Still uneven:",
      "",
      "- **The short forms are Russian letters only.** The English words (`/get`, `/class`) exist, but",
      "  there are no one-letter English forms; in the English build the hints show `/ф`, `/з` too.",
      "- **\"Recent\" in `/занятие список`** shows three classes plus the marks of the cancellations and moves",
      "  from the same stretch of time, so there can be more than three rows.",
      "- **The Ethics section answers in Russian** in the English build too: the text of the Ethics exists",
      "  only in translation, and the identifiers `Э1т7` are the same in both languages.",
    ].join("\n")
  )

  // AdminRegistry stamps the real date of today - we replace it with the date of the example, so that the file does not change every day
  const dotted = (iso) => iso.slice(0, 10).split("-").reverse().join(".") // "2026-09-16" -> "16.09.2026"
  const today = new Date().toISOString()
  const text = out
    .join("\n")
    .replaceAll(today.slice(0, 10), NOW.toISOString().slice(0, 10))
    .replaceAll(dotted(today), dotted(NOW.toISOString()))
  return {text: text.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n", blocks: out.length}
}

/** Keeps the beginning of a long answer: the first `lines` lines and no more than `chars` characters. */
function cut(entries, lines, chars = 600) {
  return entries.map((e) => {
    if (!e.text) return e
    const parts = e.text.split("\n")
    let text = parts.slice(0, lines).join("\n")
    let dropped = parts.length - Math.min(parts.length, lines)
    if (text.length > chars) {
      const keep = text.slice(0, chars)
      text = keep.slice(0, Math.max(keep.lastIndexOf(" "), chars - 40))
      dropped = e.text.slice(text.length).split("\n").length
    }
    return dropped > 0 ? {...e, text: `${text}\n… (${dropped} more lines)`} : {...e, text}
  })
}

// run directly: write INTERFACE.md (or the file named on the command line)
if (path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname)) {
  const target = process.argv[2] ?? path.join(ROOT, "INTERFACE.md")
  const {text, blocks} = await generate(process.env.SPINOZA_DOC_LANGUAGE || DEFAULT_LANGUAGE)
  fs.writeFileSync(target, text)
  if (target !== "/dev/stdout") console.log(`${target}: ${blocks} blocks`)
}
