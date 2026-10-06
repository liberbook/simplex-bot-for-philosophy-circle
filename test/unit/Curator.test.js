import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {Curator} from "../../src/bot/Curator.js"
import {Syllabus} from "../../src/bot/Syllabus.js"
import {ScheduleDesk} from "../../src/bot/ScheduleDesk.js"
import {ClassDesk} from "../../src/bot/ClassDesk.js"
import {Confirmations} from "../../src/bot/Confirmations.js"
import {ConfirmDesk} from "../../src/bot/ConfirmDesk.js"
import {Listings} from "../../src/bot/Listings.js"
import {Notifier} from "../../src/bot/Notifier.js"
import {Archivist} from "../../src/bot/Archivist.js"
import {StorageQuota} from "../../src/bot/StorageQuota.js"
import {RateLimiter} from "../../src/bot/RateLimiter.js"
import {WatchedGroups} from "../../src/bot/WatchedGroups.js"
import {OpenAccess} from "../../src/bot/AccessPolicy.js"
import {TriggerWord} from "../../src/bot/TriggerWord.js"
import {SessionStore} from "../../src/storage/SessionStore.js"
import {SubscriberStore} from "../../src/storage/SubscriberStore.js"
import {FolderFileStore} from "../../src/storage/FolderFileStore.js"
import {ClassSchedule} from "../../src/domain/ClassSchedule.js"
import {createReplies} from "../../src/bot/replies.js"
import {silentLogger} from "../../src/util/logger.js"
import {FakeGateway, GROUP, groupMessage, directMessage, offer} from "./helpers.js"

const replies = createReplies("en")
const BOB = {contactId: 4, name: "bob", memberId: 5}
// Wednesday 2026-09-16 10:00 UTC; classes on Tuesdays 19:00 UTC -> last 2026-09-15, next 2026-09-22
const NOW = new Date("2026-09-16T10:00:00Z")

function setup({schedule = "tue 19:00", language = "en"} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-curator-"))
  const gateway = new FakeGateway({groups: [GROUP]})
  const store = new FolderFileStore(path.join(dir, "archive"))
  store.ensure()
  const sessions = new SessionStore(path.join(dir, "state", "sessions.json"))
  if (schedule) sessions.setSchedule(ClassSchedule.parse(schedule, "UTC"))
  const subscribers = new SubscriberStore(path.join(dir, "state", "subscribers.json"))
  const timers = []
  const notifier = new Notifier({gateway, subscribers, replies: createReplies(language), logger: silentLogger, delayMs: 1000, setTimer: (fn) => (timers.push(fn), timers.length), clearTimer: (id) => (timers[id - 1] = null)})
  const fireTimers = async () => {
    for (const [i, fn] of timers.entries()) if (fn) (timers[i] = null, await fn())
  }
  const clock = () => NOW
  const confirmations = new Confirmations({clock: () => NOW.getTime()})
  const scheduleDesk = new ScheduleDesk({sessions, confirmations, replies: createReplies(language), logger: silentLogger, timezone: "UTC", clock})
  const groups = new WatchedGroups(gateway, "filedrop")
  const quota = new StorageQuota(store, 10 * 1024 * 1024)
  const archivist = new Archivist({gateway, groups, quota, store, logger: silentLogger, rule: new TriggerWord("conatus")})
  const classDesk = new ClassDesk({gateway, groups, sessions, notifier, confirmations, replies: createReplies(language), logger: silentLogger, clock})
  const curator = new Curator({gateway, archivist, store, sessions, notifier, scheduleDesk, classDesk, groups, replies: createReplies(language), logger: silentLogger, clock, limiter: new RateLimiter({limit: 10, windowMs: 600_000, clock: () => NOW.getTime()})})
  const listings = new Listings()
  const syllabus = new Syllabus({gateway, sessions, subscribers, access: new OpenAccess(), scheduleDesk, classDesk, listings, replies: createReplies(language), logger: silentLogger, clock})
  const confirmDesk = new ConfirmDesk({gateway, confirmations, access: new OpenAccess(), replies: createReplies(language), logger: silentLogger})
  /** a private message routed as the bot does: the ConfirmDesk first, then the Syllabus */
  const priv = async (text, overrides) => {
    const m = directMessage(text, overrides)
    if (!(await confirmDesk.handle(m))) await syllabus.handle(m)
  }
  const lastReply = () => gateway.sent.at(-1).text
  /** simulate the CLI finishing a download of `name` into the archive root */
  const finishDownload = (file, name = file.name) => {
    fs.writeFileSync(path.join(store.dir, name), "bytes")
    const stored = archivist.onFileReceived({...file, path: name})
    if (stored) curator.onFileStored(stored.file.id, stored.storedAs)
    return stored
  }
  return {gateway, store, sessions, subscribers, curator, syllabus, priv, listings, archivist, lastReply, fireTimers, finishDownload, dir}
}

test("/class post with a file: class for the next occurrence, text recorded, the saved file referenced by the card", async () => {
  const {gateway, store, sessions, curator, lastReply, finishDownload} = setup()
  const post = groupMessage({itemId: 40, text: "/class Substance\nRead E1p1-E1p10", file: offer({id: 7, name: "reading.pdf"}), sentAt: NOW})
  await curator.handle(post)
  const s = sessions.get("2026-09-22")
  assert.equal(s.topic, "Substance")
  assert.deepEqual(s.posts.map((p) => [p.itemId, p.author, p.text]), [[40, "alice", "Read E1p1-E1p10"]])
  assert.deepEqual(gateway.received, [7])
  assert.equal(lastReply(), "Post tied to the class of 22.09.2026, 19:00.")
  const stored = finishDownload(post.file)
  assert.equal(stored.storedAs, "reading.pdf")
  assert.deepEqual(store.list().map((f) => f.name), ["reading.pdf"], "the archive stays flat")
  assert.deepEqual(fs.readdirSync(store.dir), ["reading.pdf"], "no class folder is created")
  assert.deepEqual(sessions.get("2026-09-22").files, [{name: "reading.pdf", kind: "reading", addedAt: NOW.toISOString(), author: "alice"}])
})

test("explicit date wins; a reply with /class attaches the quoted post and its file", async () => {
  const {gateway, sessions, curator, lastReply} = setup()
  gateway.items["1:30"] = groupMessage({itemId: 30, text: "Homework for October: chapters 3-4", file: offer({id: 8, name: "ch3.pdf"}), sender: BOB, sentAt: NOW})
  await curator.handle(groupMessage({itemId: 31, text: "/class 06.10 Ethics part 2", quotedItemId: 30, sentAt: NOW}))
  const s = sessions.get("2026-10-06")
  assert.equal(s.topic, "Ethics part 2")
  assert.deepEqual(s.posts.map((p) => [p.itemId, p.author, p.text]), [[30, "bob", "Homework for October: chapters 3-4"]])
  assert.deepEqual(gateway.received, [8])
  assert.equal(lastReply(), "Post tied to the class of 06.10.2026, 19:00.")
})

test("a file replied to a class post joins the class; a recording goes to the last class only when marked /last", async () => {
  const {gateway, sessions, curator, lastReply, finishDownload} = setup()
  await curator.handle(groupMessage({itemId: 40, text: "/class\nRead", sentAt: NOW}))
  await curator.handle(groupMessage({itemId: 41, text: "", file: offer({id: 9, name: "extra.pdf"}), quotedItemId: 40, sender: BOB}))
  assert.deepEqual(gateway.received, [9])
  finishDownload(offer({id: 9, name: "extra.pdf"}))
  assert.deepEqual(sessions.get("2026-09-22").files.map((f) => f.name), ["extra.pdf"])

  // an unmarked audio file is an ordinary file: not the Curator's business
  const sentBefore = gateway.sent.length
  await curator.handle(groupMessage({itemId: 42, text: "", file: offer({id: 10, name: "lecture.mp3"}), sender: BOB}))
  assert.deepEqual(gateway.received, [9])
  assert.equal(gateway.sent.length, sentBefore)
  assert.equal(sessions.get("2026-09-15"), null)

  await curator.handle(groupMessage({itemId: 42, text: "/last", file: offer({id: 10, name: "lecture.mp3"}), sender: BOB}))
  assert.deepEqual(gateway.received, [9, 10])
  assert.equal(lastReply(), "Saved to the class of 15.09.2026: lecture.mp3")
  finishDownload(offer({id: 10, name: "lecture.mp3"}))
  assert.deepEqual(sessions.get("2026-09-15").files.map((f) => [f.name, f.kind, f.author]), [["lecture.mp3", "audio", "bob"]])
  // a voice message is audio too, and a date after /last overrides the schedule
  await curator.handle(groupMessage({itemId: 43, text: "/last 06.10", file: offer({id: 11, name: "voice.m4a", contentType: "voice"}), sender: BOB}))
  assert.equal(lastReply(), "Saved to the class of 06.10.2026: voice.m4a")
  // a non-audio file marked /last is filed with the last class too
  await curator.handle(groupMessage({itemId: 44, text: "/прошлое", file: offer({id: 12, name: "slides.pdf"})}))
  assert.equal(lastReply(), "Saved to the class of 15.09.2026: slides.pdf")
  // plain files without context are not the curator's business
  await curator.handle(groupMessage({itemId: 45, text: "", file: offer({id: 13, name: "random.pdf"})}))
  assert.deepEqual(gateway.received, [9, 10, 11, 12])
})

test("/last as a reply or as a bare comment refers to the quoted or the latest preceding file", async () => {
  const {gateway, store, sessions, curator, lastReply} = setup()
  gateway.items["1:30"] = groupMessage({itemId: 30, text: "", file: offer({id: 8, name: "lecture.mp3"}), sender: BOB})
  await curator.handle(groupMessage({itemId: 31, text: "/last", quotedItemId: 30}))
  assert.deepEqual(gateway.received, [8])
  assert.equal(lastReply(), "Saved to the class of 15.09.2026: lecture.mp3")
  // a comment (no reply link) after a recording the Archivist already saved: its reference joins the last class
  fs.writeFileSync(path.join(store.dir, "talk.m4a"), "saved")
  gateway.recent = [
    groupMessage({itemId: 32, text: "conatus", file: offer({id: 9, name: "talk.m4a", status: "rcvComplete", path: "talk.m4a"}), sender: BOB}),
    groupMessage({itemId: 33, text: "/last"}),
  ]
  await curator.handle(groupMessage({itemId: 33, text: "/last"}))
  assert.deepEqual(gateway.received, [8], "no second download")
  assert.deepEqual(store.list().map((f) => f.name), ["talk.m4a"])
  assert.deepEqual(sessions.get("2026-09-15").files.map((f) => [f.name, f.author]), [["talk.m4a", "bob"]])
  assert.equal(lastReply(), "Saved to the class of 15.09.2026: talk.m4a")
  // nothing to refer to
  gateway.recent = []
  await curator.handle(groupMessage({itemId: 34, text: "/last"}))
  assert.match(lastReply(), /^Which file\?/)
  await curator.handle(groupMessage({itemId: 35, text: "/last", quotedItemId: 999}))
  assert.match(lastReply(), /^Which file\?/)
})

test("a bare /class comment (no reply link) attaches the latest post before it, and an already archived file is referenced without moving", async () => {
  const {gateway, store, sessions, curator, lastReply} = setup()
  // alice posted a file captioned with the trigger word; the Archivist already saved it to the archive root
  fs.writeFileSync(path.join(store.dir, "reading.pdf"), "saved")
  gateway.recent = [
    groupMessage({itemId: 30, text: "conatus - read this for next week", file: offer({id: 8, name: "reading.pdf", status: "rcvComplete", path: "reading.pdf"}), sentAt: NOW}),
    groupMessage({itemId: 31, text: "/class Ethics", sender: BOB}),
  ]
  await curator.handle(groupMessage({itemId: 31, text: "/class Ethics", sender: BOB}))
  const s = sessions.get("2026-09-22")
  assert.equal(s.topic, "Ethics")
  assert.deepEqual(s.posts.map((p) => [p.itemId, p.author, p.text]), [[30, "alice", "conatus - read this for next week"]])
  assert.deepEqual(s.files.map((f) => [f.name, f.kind]), [["reading.pdf", "reading"]])
  assert.deepEqual(store.list().map((f) => f.name), ["reading.pdf"])
  assert.equal(fs.readFileSync(path.join(store.dir, "reading.pdf"), "utf8"), "saved", "the file did not move")
  assert.deepEqual(gateway.received, [], "no second download")
  assert.equal(lastReply(), "Post tied to the class of 22.09.2026, 19:00.")
  // with nothing to refer to, a topic alone still announces the next class ...
  gateway.recent = []
  await curator.handle(groupMessage({itemId: 50, text: "/class Substance", sender: BOB}))
  assert.equal(sessions.get("2026-09-22").topic, "Substance")
  // ... while a bare "/spinoza занятие" shows the next class in the group instead of recording anything
  const {gateway: g2, curator: c2, sessions: s2} = setup()
  g2.recent = []
  await c2.handle(groupMessage({itemId: 51, text: "/spinoza занятие", sender: BOB}))
  assert.equal(g2.sent.at(-1).text, "NEXT CLASS\n\n22.09.2026, 19:00\n\nNothing posted yet.\n\nSchedule: every Tuesday at 19:00", "no private footer in the group")
  assert.deepEqual(s2.list(), [])
  const {gateway: g3, curator: c3} = setup({schedule: null})
  g3.recent = []
  await c3.handle(groupMessage({itemId: 52, text: "/spinoza занятие", sender: BOB}))
  assert.equal(g3.sent.at(-1).text, "No regular schedule yet.")
})

test("attaching a file the bot already has: from the root, from another class's card, still downloading, or gone", async () => {
  const {gateway, store, sessions, curator, archivist, lastReply, finishDownload} = setup()
  // on another class's card: the reference moves, the file does not
  fs.writeFileSync(path.join(store.dir, "notes.pdf"), "old")
  const old = sessions.save({...(await import("../../src/domain/Session.js")).newSession("2026-09-15", NOW), files: [{name: "notes.pdf", kind: "reading", addedAt: NOW.toISOString(), author: "bob"}]}, NOW)
  assert.equal(old.files.length, 1)
  gateway.items["1:30"] = groupMessage({itemId: 30, text: "notes for next week", file: offer({id: 8, name: "notes.pdf", status: "rcvComplete", path: "notes.pdf"}), sender: BOB, sentAt: NOW})
  await curator.handle(groupMessage({itemId: 31, text: "/class", quotedItemId: 30}))
  assert.equal(lastReply(), "Post tied to the class of 22.09.2026, 19:00.")
  assert.deepEqual(store.list().map((f) => f.name), ["notes.pdf"])
  assert.deepEqual(sessions.get("2026-09-15").files, [])
  assert.deepEqual(sessions.get("2026-09-22").files.map((f) => f.name), ["notes.pdf"])
  assert.deepEqual(gateway.received, [], "nothing downloaded")

  // in the archive (e.g. copied by hand) but on no card yet; a second /class for it changes nothing
  fs.writeFileSync(path.join(store.dir, "extra.pdf"), "x")
  gateway.items["1:32"] = groupMessage({itemId: 32, text: "", file: offer({id: 9, name: "extra.pdf", status: "rcvComplete", path: "extra.pdf"}), sender: BOB, sentAt: NOW})
  await curator.handle(groupMessage({itemId: 33, text: "/class", quotedItemId: 32}))
  await curator.handle(groupMessage({itemId: 33, text: "/class", quotedItemId: 32}))
  assert.deepEqual(sessions.get("2026-09-22").files.map((f) => f.name), ["notes.pdf", "extra.pdf"])

  // still downloading: claimed for the class, confirmed by the card
  await archivist.save(offer({id: 10, name: "big.pdf"}), groupMessage({itemId: 34, text: ""}))
  gateway.items["1:34"] = groupMessage({itemId: 34, text: "", file: offer({id: 10, name: "big.pdf", status: "rcvTransfer", path: "big.pdf"}), sender: BOB, sentAt: NOW})
  await curator.handle(groupMessage({itemId: 35, text: "/class", quotedItemId: 34}))
  assert.deepEqual(gateway.received, [10], "no second download")
  const stored = finishDownload(offer({id: 10, name: "big.pdf"}))
  assert.equal(stored.storedAs, "big.pdf")
  assert.deepEqual(sessions.get("2026-09-22").files.map((f) => f.name), ["notes.pdf", "extra.pdf", "big.pdf"])
  assert.deepEqual(fs.readdirSync(store.dir).sort(), ["big.pdf", "extra.pdf", "notes.pdf"], "still flat")

  // completed long ago but no longer in the archive (deleted): the user is told
  gateway.items["1:36"] = groupMessage({itemId: 36, text: "", file: offer({id: 11, name: "gone.pdf", status: "rcvComplete", path: "gone.pdf"}), sender: BOB, sentAt: NOW})
  await curator.handle(groupMessage({itemId: 37, text: "/class", quotedItemId: 36}))
  assert.match(gateway.sent.at(-2).text, /^Could not add gone\.pdf to the class/)
  assert.deepEqual(gateway.received, [10])
})

test("/move and /cancel are private commands: the group ignores them, the private chat runs them and the group is told", async () => {
  const {gateway, sessions, curator, syllabus, priv, lastReply, store} = setup()
  const bob = {sender: BOB, chat: {type: "direct", id: 4, name: "bob"}}
  await curator.handle(groupMessage({itemId: 40, text: "/class Substance\nRead", sentAt: NOW}))
  const before = gateway.sent.length
  await curator.handle(groupMessage({itemId: 41, text: "/move 24.09 20:00", sender: BOB}))
  await curator.handle(groupMessage({itemId: 42, text: "/spinoza перенос 24.09 20:00", sender: BOB}))
  assert.equal(gateway.sent.length, before, "nothing happens in the group")
  assert.equal(sessions.get("2026-09-24"), null)
  await curator.handle(groupMessage({itemId: 43, text: "/занятие перенос 20:00", sender: BOB}))
  assert.equal(lastReply(), "This is done in the private chat: write to me or send /spinoza.", "a private class operation typed in the group is redirected, not turned into a post")
  assert.equal(sessions.get("2026-09-22").topic, "Substance", "the topic is untouched")
  await priv("/подтвердить", bob)
  assert.match(lastReply(), /^Nothing to confirm\.\n\nPreviews come from/)
  await priv("/занятие перенос 24.09 20:00", bob)
  assert.equal(lastReply(), "Move the class of 22.09.2026, 19:00 to 24.09.2026, 20:00?\n\nIts homework and files move along.\n\nConfirm: /confirm\nDrop: /drop")
  await priv("/отменить", bob)
  assert.equal(lastReply(), "Dropped, nothing changed.", "/отменить drops the preview")
  assert.equal(sessions.get("2026-09-24"), null)
  await priv("/отменить", bob)
  assert.equal(lastReply(), "Nothing to drop.\n\nPreviews come from: /class schedule, /class move, /class cancel, /vote")
  await priv("/move 24.09 20:00", bob)
  await priv("/занятие подтвердить", bob)
  assert.equal(lastReply(), 'Class 22.09.2026 moved to 24.09.2026, 20:00. Its homework and files moved along. Announced in the group "filedrop".')
  assert.deepEqual(gateway.sent.slice(-2).map((m) => m.chat.type), ["group", "direct"], "announced in the group, echoed privately")
  assert.equal(sessions.get("2026-09-24").time, "20:00")
  assert.equal(sessions.get("2026-09-22").status, "moved")
  await priv("/отмена", bob)
  assert.match(lastReply(), /^Cancel the class of 24\.09\.2026, 20:00\?/)
  await priv("/подтвердить", bob)
  assert.equal(lastReply(), 'Class 24.09.2026 is cancelled. Its homework and files moved to 29.09.2026. Announced in the group "filedrop".')
  assert.equal(sessions.get("2026-09-24"), null, "a moved-to date leaves no marker")
  assert.equal(sessions.get("2026-09-22").movedTo, "2026-09-29", "the earlier marker follows the materials")
  assert.equal(sessions.get("2026-09-29").posts[0].text, "Read")
  assert.deepEqual(store.list(), [])
})

test("deleting a class post for everyone removes its text and file from the card; the file stays restorable to it", async () => {
  const {sessions, curator, finishDownload} = setup()
  await curator.handle(groupMessage({itemId: 40, text: "/class Substance\nRead", file: offer({id: 7, name: "reading.pdf"}), sentAt: NOW}))
  finishDownload(offer({id: 7, name: "reading.pdf"}))
  await curator.handle(groupMessage({itemId: 41, text: "/class\nAlso read the preface", sentAt: NOW}))
  assert.equal(sessions.get("2026-09-22").posts.length, 2)
  curator.onMessageDeleted(groupMessage({itemId: 40, text: "/class Substance\nRead", file: offer({id: 7, name: "reading.pdf", path: "reading.pdf"})}), {name: "reading.pdf", storedAs: "reading.20260916-100000.pdf"})
  const s = sessions.get("2026-09-22")
  assert.deepEqual(s.posts.map((p) => p.itemId), [41])
  assert.deepEqual(s.files, [])
  assert.deepEqual(s.deletedFiles.map((f) => [f.name, f.kind, f.author]), [["reading.20260916-100000.pdf", "reading", "alice"]], "remembered under its name in the deleted folder")
  curator.onMessageDeleted(groupMessage({itemId: 99, text: "unrelated"}), null) // nothing to do
})

test("group talk that starts with a command word is not a command: no post, no reply; prius followed by words is Latin, not a marker", async () => {
  const {gateway, curator, sessions} = setup()
  gateway.recent = []
  for (const text of ["Занятие переносится на вторник?", "Расписание пока прежнее", "Занятие 22.09 Субстанция", "class notes are ready", "prius est quam", "Prius в философии значит «раньше»"]) await curator.handle(groupMessage({itemId: 500, text}))
  assert.deepEqual(gateway.sent, [], "silence")
  assert.deepEqual(sessions.list(), [], "no class recorded from talk")
  await curator.handle(groupMessage({itemId: 501, text: "/Занятие 22.09 Субстанция"}))
  assert.equal(sessions.list().length, 1, "with the slash it is the command")
})

test("without a schedule an undated announcement or recording asks for a date", async () => {
  const {curator, lastReply, sessions} = setup({schedule: null})
  await curator.handle(groupMessage({itemId: 40, text: "/class\nRead", sentAt: NOW}))
  assert.match(lastReply(), /^Which class\? Add the date: prius <date>\.$/)
  assert.deepEqual(sessions.list(), [])
  await curator.handle(groupMessage({itemId: 41, text: "/class 22.09\nRead", sentAt: NOW}))
  assert.equal(sessions.list()[0].date, "2026-09-22")
  await curator.handle(groupMessage({itemId: 42, text: "/last", file: offer({id: 10, name: "lecture.mp3"})}))
  assert.match(lastReply(), /^Which class\? Add the date: prius <date>\.$/)
})

test("edits of a class post are tracked and subscribers get one note per class after the quiet period", async () => {
  const {gateway, sessions, subscribers, curator, fireTimers} = setup()
  subscribers.set({contactId: 4, name: "bob"}, true)
  await curator.handle(groupMessage({itemId: 40, text: "/class Topic\nRead chapter 1", sentAt: NOW}))
  await curator.handleUpdate(groupMessage({itemId: 40, text: "/class Topic\nRead chapters 1 and 2", sentAt: NOW}))
  await curator.handleUpdate(groupMessage({itemId: 99, text: "unrelated edit"}))
  const post = sessions.get("2026-09-22").posts[0]
  assert.equal(post.text, "Read chapters 1 and 2")
  assert.equal(post.editedAt, NOW.toISOString())
  const before = gateway.sent.length
  await fireTimers()
  const notes = gateway.sent.slice(before)
  assert.equal(notes.length, 1)
  assert.deepEqual(notes[0].chat, {type: "direct", id: 4, name: "bob"})
  assert.match(notes[0].text, /^Class 22\.09\.2026: new post \(alice\); homework edited \(alice\)\.\n\nDetails: \/class 22\.09$/)
})

test("the schedule is set privately by any member after a preview and /confirm; the group only sees the short form", async () => {
  const {curator, syllabus, priv, sessions, lastReply} = setup({schedule: null})
  const bob = {sender: BOB, chat: {type: "direct", id: 4, name: "bob"}}
  await syllabus.handle(directMessage("/schedule"))
  assert.equal(lastReply(), "No regular schedule yet.\n\nSet it: /class schedule <weekday> <hh:mm>\nExample: /class schedule tue 19:00")
  await curator.handle(groupMessage({text: "/spinoza расписание", sender: BOB}))
  assert.equal(lastReply(), "No regular schedule yet.")
  await curator.handle(groupMessage({text: "/spinoza расписание вт 19:00", sender: BOB}))
  assert.equal(lastReply(), "No regular schedule yet.", "the group cannot change it")
  assert.equal(sessions.getSchedule(), null)
  await syllabus.handle(directMessage("/schedule nonsense", bob))
  assert.equal(lastReply(), "Usage: /class schedule <weekday> <hh:mm>\nExample: /class schedule tue 19:00")
  await syllabus.handle(directMessage("/schedule вт 19:00", bob))
  assert.equal(lastReply(), "NEW SCHEDULE\n\nEvery Tuesday at 19:00\nTime zone: UTC\n\nNext class:\n22.09.2026, 19:00\n\nApply: /confirm\nDrop: /drop")
  assert.equal(sessions.getSchedule(), null, "not applied before the confirmation")
  await priv("/drop", bob)
  assert.equal(lastReply(), "Dropped, nothing changed.")
  await priv("/confirm", bob)
  assert.match(lastReply(), /^Nothing to confirm/)
  await priv("/schedule вт 19:00", bob)
  await priv("/confirm", bob)
  assert.equal(lastReply(), "Schedule changed: every Tuesday at 19:00.\nNext class: 22.09.2026, 19:00.\nPast classes, moves, cancellations and materials are kept.")
  assert.equal(sessions.getSchedule().weekday, 2)
  await curator.handle(groupMessage({text: "/spinoza расписание", sender: BOB}))
  assert.equal(lastReply(), "SCHEDULE\n\nEvery Tuesday at 19:00\nNext class: 22.09.2026, 19:00")
  await curator.handle(groupMessage({text: "/spinoza расписание ср 18:30", sender: BOB}))
  assert.equal(lastReply(), "SCHEDULE\n\nEvery Tuesday at 19:00\nNext class: 22.09.2026, 19:00\n\nChange it: in the private chat, /class schedule", "a change asked in the group is redirected")
  await syllabus.handle(directMessage("/schedule"))
  assert.equal(lastReply(), "SCHEDULE\n\nEvery Tuesday at 19:00\nTime zone: UTC\n\nNext class:\n22.09.2026, 19:00\n\nHelp: /class ?")
  // the outlook shows moves, cancellations and time changes ahead
  await priv("/move 24.09 20:00", bob)
  await priv("/confirm", bob)
  await priv("/cancel 29.09", bob)
  await priv("/confirm", bob)
  await syllabus.handle(directMessage("/schedule"))
  assert.equal(lastReply(), ["SCHEDULE", "", "Every Tuesday at 19:00", "Time zone: UTC", "", "Next class:", "24.09.2026, 20:00 (moved from 22.09.2026)", "", "Exceptions:", "22.09.2026 · moved to 24.09.2026, 20:00", "29.09.2026 · cancelled", "", "Help: /class ?"].join("\n"))
  await syllabus.handle(directMessage("/дз"))
  assert.match(lastReply(), /^NEXT CLASS\n\n24\.09\.2026, 20:00\nMoved from 22\.09\.2026\n/)
  await priv("/расписание ср 18:30", bob)
  assert.match(lastReply(), /^NEW SCHEDULE\n\nEvery Wednesday at 18:30\nTime zone: UTC\n\nNext class:\n16\.09\.2026, 18:30\n/, "the preview already counts by the new rule (today is a Wednesday)")
  await priv("/подтвердить", bob)
  assert.match(lastReply(), /^Schedule changed: every Wednesday at 18:30\./)
  assert.equal(sessions.getSchedule().weekday, 3)
})

test("private side: /дз card, /classes list, /watch on|off", async () => {
  const {gateway, curator, syllabus, listings, lastReply, finishDownload} = setup()
  assert.equal(await syllabus.handle(directMessage("/list")), false)
  assert.equal(await syllabus.handle(directMessage("/дз")), true)
  assert.equal(lastReply(), "NEXT CLASS\n\n22.09.2026, 19:00\n\nNothing posted yet.\n\nSchedule: every Tuesday at 19:00\n\nAll classes: /class list\nHelp: /class ?", "a regular date without an entry still has a card")
  await curator.handle(groupMessage({itemId: 40, text: "/spinoza class Substance\nRead E1p1-E1p10", file: offer({id: 7, name: "reading.pdf"}), sentAt: NOW}))
  finishDownload(offer({id: 7, name: "reading.pdf"}))
  await curator.handle(groupMessage({itemId: 42, text: "prius", file: offer({id: 10, name: "lecture.mp3"}), sender: BOB}))
  finishDownload(offer({id: 10, name: "lecture.mp3"}))
  await syllabus.handle(directMessage("/дз"))
  assert.equal(lastReply(), "NEXT CLASS\n\n22.09.2026, 19:00\nTopic: Substance\n\nHomework (alice):\nRead E1p1-E1p10\n\nFiles:\n1. reading.pdf\n\nSchedule: every Tuesday at 19:00\n\nReceive: /д <number>\nAll classes: /class list\nHelp: /class ?")
  await syllabus.handle(directMessage("/занятие"))
  assert.match(lastReply(), /^NEXT CLASS\n\n22\.09\.2026/, "/занятие is the card")
  await syllabus.handle(directMessage("/з 29.09"))
  assert.equal(lastReply(), "CLASS · planned\n\n29.09.2026, 19:00\n\nNothing posted yet.\n\nSchedule: every Tuesday at 19:00\n\nAll classes: /class list\nHelp: /class ?")
  await syllabus.handle(directMessage("/занятие 30.09"))
  assert.match(lastReply(), /^There is no class "30.09"/, "not a regular date, nothing recorded")
  // right after a class the card is already the next one, not today's
  const afterClass = new Syllabus({gateway, sessions: syllabus.sessions, subscribers: syllabus.subscribers, access: new OpenAccess(), scheduleDesk: syllabus.scheduleDesk, classDesk: syllabus.classDesk, confirmations: syllabus.confirmations, replies, logger: silentLogger, clock: () => new Date("2026-09-15T20:00:00Z")})
  await afterClass.handle(directMessage("/дз"))
  assert.match(lastReply(), /^NEXT CLASS\n\n22\.09\.2026, 19:00\nTopic: Substance/)
  await syllabus.handle(directMessage("/homework 15.09"))
  assert.equal(lastReply(), "CLASS · past\n\n15.09.2026, 19:00\n\nRecording:\n1. lecture.mp3\n\nSchedule: every Tuesday at 19:00\n\nReceive: /д <number>\nAll classes: /class list\nHelp: /class ?")
  assert.deepEqual(listings.resolve("archive", 3, 1, []), {name: "lecture.mp3", count: 1}, "the card's numbers are the chat's last list: /д 1 fetches the recording")
  await syllabus.handle(directMessage("/дз 01.01"))
  assert.match(lastReply(), /There is no class "01.01"/)
  await syllabus.handle(directMessage("/classes"))
  assert.equal(lastReply(), "CLASSES\n\nUpcoming:\n22.09, 19:00 · Substance · 1 post · 1 file\n29.09, 19:00 · nothing yet\n06.10, 19:00 · nothing yet\n\nRecent:\n15.09 · recording\n\nMonth: /class list 09.2026\nArchive: /class list archive\nHelp: /class ?", "no zeros: only what a class has")
  await syllabus.handle(directMessage("/занятие список"))
  assert.match(lastReply(), /^CLASSES\n\nUpcoming:\n22\.09, 19:00/)
  await syllabus.handle(directMessage("/з с 09.2026"))
  assert.equal(lastReply(), "CLASSES · SEPTEMBER 2026\n\n15.09 · past · recording\n22.09, 19:00 · next · Substance · 1 post · 1 file\n29.09, 19:00 · planned · nothing yet\n\nPrevious: /class list 08.2026\nNext: /class list 10.2026")
  await syllabus.handle(directMessage("/classes 2026"))
  assert.equal(lastReply(), "CLASSES · 2026\n\nSeptember · 2 classes\n\nOpen a month: /class list 09.2026")
  await syllabus.handle(directMessage("/classes archive"))
  assert.equal(lastReply(), "CLASS ARCHIVE\n\n2026 · 2 classes\n\nOpen a year: /class list 2026")
  await syllabus.handle(directMessage("/classes nonsense"))
  assert.match(lastReply(), /^Which period\?/)
  await syllabus.handle(directMessage("/занятие ?"))
  assert.match(lastReply(), /^CLASSES\n\n\/class \[date\]\n[\s\S]*Short: \/з о\n/)
  await syllabus.handle(directMessage("/watch"))
  assert.match(lastReply(), /^Notifications about classes are off\.\n\nTurn on: \/watch on$/)
  await syllabus.handle(directMessage("/уведомления вкл"))
  assert.match(lastReply(), /^Notifications about classes are on/)
  await syllabus.handle(directMessage("/watch"))
  assert.match(lastReply(), /^Notifications about classes are on/, "no hidden toggle: asking again keeps them on")
  await syllabus.handle(directMessage("/watch maybe"))
  assert.match(lastReply(), /^Send \/watch on or \/watch off/)
  await syllabus.handle(directMessage("/ув выкл"))
  assert.equal(lastReply(), "Notifications about classes are off.\n\nTurn on: /watch on")
  assert.equal(gateway.sent.filter((m) => m.chat.type === "direct").length > 0, true)
})

test("Russian texts for the class card", async () => {
  const {curator, syllabus, lastReply} = setup({language: "ru"})
  await curator.handle(groupMessage({itemId: 40, text: "/class Субстанция\nПрочитать Э1т1-Э1т10", sentAt: NOW}))
  assert.equal(lastReply(), "Пост связан с занятием 22.09.2026, 19:00.")
  await syllabus.handle(directMessage("/дз"))
  assert.equal(lastReply(), "БЛИЖАЙШЕЕ ЗАНЯТИЕ\n\n22.09.2026, 19:00\nТема: Субстанция\n\nЗадание (alice):\nПрочитать Э1т1-Э1т10\n\nРасписание: каждый вторник в 19:00\n\nВсе занятия: /занятие список\nСправка: /занятие ?")
})

test("a new weekly rule leaves classes with materials where they are: the preview names them, the confirmation pins their time", async () => {
  const {curator, syllabus, priv, sessions, lastReply} = setup()
  await curator.handle(groupMessage({itemId: 300, text: "/class Substance\nRead E1p1-E1p10"})) // the class of Tue 22.09 gets a post
  await priv("/schedule ср 18:30", BOB)
  assert.equal(lastReply(), "NEW SCHEDULE\n\nEvery Wednesday at 18:30\nTime zone: UTC\n\nNext class:\n16.09.2026, 18:30\n\nStays as it is:\n22.09.2026, 19:00\n\nApply: /confirm\nDrop: /drop")
  assert.equal(sessions.get("2026-09-22").time, null, "nothing changes before the confirmation")
  await priv("/confirm", BOB)
  assert.equal(lastReply(), "Schedule changed: every Wednesday at 18:30.\nNext class: 16.09.2026, 18:30.\nThe class of 22.09.2026, 19:00 stays as it is.\nPast classes, moves, cancellations and materials are kept.")
  assert.equal(sessions.get("2026-09-22").time, "19:00", "the old rule's time became the class's own")
  await syllabus.handle(directMessage("/class 22.09"))
  assert.match(lastReply(), /^CLASS · planned\n\n22\.09\.2026, 19:00\nTopic: Substance\n/, "the card keeps showing 19:00 under the Wednesday rule")
})

test("a class file the archive refuses gets one line in the group, never silence", async () => {
  const {gateway, curator} = setup()
  await curator.handle(groupMessage({itemId: 40, text: "/class Substance", file: offer({id: 7, name: "lecture.mp3", size: 50 * 1024 * 1024}), sentAt: NOW}))
  assert.deepEqual(gateway.received, [])
  const said = () => gateway.sent.map((m) => m.text)
  assert.ok(said().includes("Could not add lecture.mp3 to the class: the archive is full."), said().join(" | "))
  await curator.handle(groupMessage({itemId: 41, text: "/class Substance", file: offer({id: 8, name: "../x.mp3"}), sentAt: NOW}))
  assert.ok(said().includes("Could not add ../x.mp3 to the class: a file name with a path or control characters is not allowed."))
})
