import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {ClassDesk} from "../../src/bot/ClassDesk.js"
import {Confirmations} from "../../src/bot/Confirmations.js"
import {Notifier} from "../../src/bot/Notifier.js"
import {WatchedGroups} from "../../src/bot/WatchedGroups.js"
import {SessionStore} from "../../src/storage/SessionStore.js"
import {SubscriberStore} from "../../src/storage/SubscriberStore.js"
import {FolderFileStore} from "../../src/storage/FolderFileStore.js"
import {ClassSchedule} from "../../src/domain/ClassSchedule.js"
import {newSession} from "../../src/domain/Session.js"
import {createReplies} from "../../src/bot/replies.js"
import {silentLogger} from "../../src/util/logger.js"
import {FakeGateway, GROUP, DIRECT_ALICE} from "./helpers.js"

const replies = createReplies("en")
const NOW = new Date("2026-09-16T10:00:00Z") // Wednesday; classes tue 19:00 UTC -> next 2026-09-22
const BOB = {name: "bob", memberId: 5, contactId: 4}

function setup({schedule = "tue 19:00"} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-classdesk-"))
  const gateway = new FakeGateway({groups: [GROUP]})
  const store = new FolderFileStore(path.join(dir, "archive"))
  store.ensure()
  const sessions = new SessionStore(path.join(dir, "state", "sessions.json"))
  if (schedule) sessions.setSchedule(ClassSchedule.parse(schedule, "UTC"))
  const subscribers = new SubscriberStore(path.join(dir, "state", "subscribers.json"))
  const timers = []
  const notifier = new Notifier({gateway, subscribers, replies, logger: silentLogger, delayMs: 1000, setTimer: (fn) => (timers.push(fn), timers.length), clearTimer: (id) => (timers[id - 1] = null)})
  const fireTimers = async () => {
    for (const [i, fn] of timers.entries()) if (fn) (timers[i] = null, await fn())
  }
  const reminder = {rescheduled: 0, reschedule: () => reminder.rescheduled++}
  const confirmations = new Confirmations({clock: () => NOW.getTime()})
  const desk = new ClassDesk({gateway, groups: new WatchedGroups(gateway, "filedrop"), sessions, notifier, confirmations, reminder, replies, logger: silentLogger, clock: () => NOW})
  /** what "/confirm" does: runs the pending action of `who` (nothing when none) */
  const confirm = async (who = BOB) => {
    const run = confirmations.take(who)
    if (run) await run()
    return run !== null
  }
  /** a class with a post and references to files in the (flat) archive */
  const seed = (date, names, deletedNames = []) => {
    const s = newSession(date, NOW)
    s.topic = "Substance"
    s.posts.push({itemId: 40, groupId: 1, author: "alice", text: "Read E1p1", sentAt: NOW.toISOString(), editedAt: null})
    const ref = (name) => ({name, kind: name.endsWith(".mp3") ? "audio" : "reading", addedAt: NOW.toISOString(), author: "alice"})
    for (const name of names) {
      fs.writeFileSync(path.join(store.dir, name), "x")
      s.files.push(ref(name))
    }
    s.deletedFiles = deletedNames.map(ref)
    return sessions.save(s, NOW)
  }
  return {gateway, store, sessions, subscribers, desk, reminder, confirmations, confirm, fireTimers, seed, texts: () => gateway.sent.map((m) => m.text)}
}

test("/move previews the move with concrete dates and, once confirmed, relocates the class with its posts and file references, the archive untouched; a marker stays on the regular date", async () => {
  const {gateway, store, sessions, desk, reminder, confirm, seed, texts} = setup()
  seed("2026-09-22", ["reading.pdf"], ["old.pdf"])
  await desk.move("23.09 20:30", BOB, GROUP)
  assert.deepEqual(texts(), ["Move the class of 22.09.2026, 19:00 to 23.09.2026, 20:30?\n\nIts homework and files move along.\n\nConfirm: /confirm\nDrop: /drop"])
  assert.equal(sessions.get("2026-09-23"), null, "nothing happens before the confirmation")
  assert.deepEqual(store.list().map((f) => f.name), ["reading.pdf"])
  gateway.sent = []
  await confirm()
  assert.deepEqual(texts(), ["Class 22.09.2026 moved to 23.09.2026, 20:30. Its homework and files moved along."])
  assert.deepEqual(gateway.sent[0].chat, GROUP)
  const marker = sessions.get("2026-09-22")
  assert.deepEqual([marker.status, marker.movedTo, marker.posts, marker.files, marker.deletedFiles], ["moved", "2026-09-23", [], [], []])
  const moved = sessions.get("2026-09-23")
  assert.deepEqual([moved.status, moved.time, moved.topic, moved.posts.length], ["planned", "20:30", "Substance", 1])
  assert.deepEqual(moved.files.map((f) => f.name), ["reading.pdf"])
  assert.deepEqual(moved.deletedFiles.map((f) => f.name), ["old.pdf"], "a file awaiting /restore follows its class")
  assert.deepEqual(store.list().map((f) => f.name), ["reading.pdf"], "the file itself did not move")
  assert.deepEqual(fs.readdirSync(store.dir), ["reading.pdf"], "no folder appeared")
  assert.equal(reminder.rescheduled, 1)

  // time only: the preview names the concrete date; the moved class is now "the next one"
  gateway.sent = []
  await desk.move("19:00", BOB, DIRECT_ALICE)
  assert.deepEqual(texts(), ["Move the class of 23.09.2026 from 20:30 to 19:00?\n\nConfirm: /confirm\nDrop: /drop"])
  gateway.sent = []
  await confirm()
  assert.deepEqual(texts(), ["Class 23.09.2026 now starts at 19:00.", 'Class 23.09.2026 now starts at 19:00. Announced in the group "filedrop".'], "announced in the group and echoed privately")
  assert.deepEqual(gateway.sent.map((m) => m.chat.type), ["group", "direct"])
  assert.equal(sessions.get("2026-09-23").time, null, "the schedule's own time is not an override")
  gateway.sent = []
  await desk.move("19:00", BOB, DIRECT_ALICE)
  assert.deepEqual(texts(), ["The class of 23.09.2026 is already at 19:00."])
  assert.equal(await confirm(), false, "nothing to confirm")

  // moving again: a date that is not a regular one is simply forgotten
  gateway.sent = []
  await desk.move("2026-09-24", BOB, GROUP)
  await confirm()
  assert.equal(sessions.get("2026-09-23"), null)
  assert.deepEqual(sessions.get("2026-09-24").files.map((f) => f.name), ["reading.pdf"])
  assert.deepEqual(store.list().map((f) => f.name), ["reading.pdf"])
  assert.match(texts()[1], /^Class 23\.09\.2026 moved to 24\.09\.2026, 19:00\./)
})

test("/move: usage, no schedule, merging into an existing class; a stale confirmation finds the class gone", async () => {
  const {sessions, desk, seed, confirm, texts, gateway} = setup()
  await desk.move("", BOB, GROUP)
  assert.match(texts()[0], /^Move it where\?/)
  await desk.move("nonsense", BOB, GROUP)
  assert.match(texts()[1], /^Move it where\?/)
  await desk.move("23.09 25:00", BOB, GROUP)
  assert.match(texts()[2], /^Move it where\?/)
  assert.equal(await confirm(), false)
  gateway.sent = []
  seed("2026-09-22", ["reading.pdf", "shared.pdf"])
  seed("2026-09-29", ["shared.pdf", "more.pdf"])
  await desk.move("29.09", BOB, GROUP)
  await confirm()
  const merged = sessions.get("2026-09-29")
  assert.equal(merged.posts.length, 1, "the same post is not duplicated")
  assert.deepEqual(merged.files.map((f) => f.name).sort(), ["more.pdf", "reading.pdf", "shared.pdf"], "a union of references, each file once")
  assert.equal(sessions.get("2026-09-22").status, "moved")

  // two previews for the same class: the second one confirmed after the first was already carried out
  gateway.sent = []
  await desk.move("30.09", {name: "carol", contactId: 9}, GROUP)
  await desk.move("01.10", BOB, GROUP)
  await confirm({name: "carol", contactId: 9})
  await confirm(BOB)
  assert.equal(texts().at(-1), "Class 29.09.2026 is already cancelled or moved.")

  const {desk: bare, texts: bareTexts} = setup({schedule: null})
  await bare.move("23.09", BOB, GROUP)
  assert.match(bareTexts()[0], /^No regular schedule yet/)
})

test("/cancel shows the consequences and waits for the confirmation; then the materials go to the following class and followers are told", async () => {
  const {gateway, store, sessions, subscribers, desk, seed, confirm, confirmations, fireTimers, texts} = setup()
  subscribers.set({contactId: 4, name: "bob"}, true)
  seed("2026-09-22", ["reading.pdf", "lecture.mp3"])
  await desk.cancel("", BOB, DIRECT_ALICE)
  assert.deepEqual(texts(), ["Cancel the class of 22.09.2026, 19:00?\n\nIts homework and files will move to the class of 29.09.2026, 19:00.\n\nConfirm: /confirm\nDrop: /drop"])
  assert.equal(sessions.get("2026-09-22").status, "planned", "nothing happens before the confirmation")
  assert.equal(await confirm({name: "alice", contactId: 3}), false, "someone else cannot confirm")
  gateway.sent = []
  await confirm()
  assert.deepEqual(texts(), ["Class 22.09.2026 is cancelled. Its homework and files moved to 29.09.2026.", 'Class 22.09.2026 is cancelled. Its homework and files moved to 29.09.2026. Announced in the group "filedrop".'])
  const marker = sessions.get("2026-09-22")
  assert.deepEqual([marker.status, marker.movedTo, marker.files], ["cancelled", "2026-09-29", []])
  const next = sessions.get("2026-09-29")
  assert.deepEqual(next.files.map((f) => f.name), ["reading.pdf", "lecture.mp3"])
  assert.equal(next.posts[0].text, "Read E1p1")
  assert.deepEqual(store.list().map((f) => f.name), ["lecture.mp3", "reading.pdf"])
  gateway.sent = []
  await fireTimers()
  assert.equal(gateway.sent.length, 1)
  assert.equal(gateway.sent[0].text, "Class 29.09.2026: class 22.09.2026 cancelled, its materials are here now (bob).\n\nDetails: /class 29.09")

  gateway.sent = []
  await desk.cancel("22.09", BOB, GROUP)
  assert.deepEqual(texts(), ["Class 22.09.2026 is already cancelled or moved."])
  await desk.cancel("nonsense", BOB, GROUP)
  assert.match(texts()[1], /^Which class\?/)
  // cancelling a class that has no entry yet still leaves a marker, so the calendar skips it
  await desk.cancel("2026-10-06", BOB, GROUP)
  assert.match(texts()[2], /^Cancel the class of 06\.10\.2026, 19:00\?\n\nNothing is posted for it yet; the following class is 13\.10\.2026, 19:00\./)
  await confirm()
  assert.equal(sessions.get("2026-10-06").status, "cancelled")
  assert.equal(sessions.get("2026-10-06").movedTo, "2026-10-13")
  assert.equal(await confirm(), false, "a confirmation is used once")
  // a preview can be dropped
  await desk.cancel("", BOB, GROUP)
  assert.equal(confirmations.drop(BOB), true)
  assert.equal(await confirm(), false)
  assert.equal(sessions.get("2026-09-29").status, "planned")
})
