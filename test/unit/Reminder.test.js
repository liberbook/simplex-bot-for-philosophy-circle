import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {Reminder} from "../../src/bot/Reminder.js"
import {WatchedGroups} from "../../src/bot/WatchedGroups.js"
import {SessionStore} from "../../src/storage/SessionStore.js"
import {ClassSchedule} from "../../src/domain/ClassSchedule.js"
import {newSession} from "../../src/domain/Session.js"
import {createReplies} from "../../src/bot/replies.js"
import {silentLogger} from "../../src/util/logger.js"
import {FakeGateway, GROUP} from "./helpers.js"

const replies = createReplies("en")
const HOUR = 3_600_000
const tick = () => new Promise((r) => setImmediate(r))

function setup({schedule = "tue 19:00", leadMs = 30 * 60_000, start = "2026-09-16T10:00:00Z"} = {}) {
  let now = Date.parse(start)
  const gateway = new FakeGateway({groups: [GROUP]})
  const sessions = new SessionStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-reminder-")), "sessions.json"))
  if (schedule) sessions.setSchedule(ClassSchedule.parse(schedule, "UTC"))
  const timers = [] // {fn, ms} | null
  const reminder = new Reminder({
    gateway, groups: new WatchedGroups(gateway, "filedrop"), sessions, replies, logger: silentLogger, leadMs,
    clock: () => new Date(now), setTimer: (fn, ms) => (timers.push({fn, ms}), timers.length), clearTimer: (id) => (timers[id - 1] = null),
  })
  const pending = () => timers.filter(Boolean)
  /** advance the clock by the pending timer's delay and run it */
  const elapse = async () => {
    const [t] = pending()
    assert.ok(t, "a timer is pending")
    now += t.ms
    timers[timers.indexOf(t)] = null
    t.fn()
    await tick()
  }
  return {gateway, sessions, reminder, pending, elapse, at: (iso) => (now = Date.parse(iso)), texts: () => gateway.sent.map((m) => m.text)}
}

test("waits in bounded steps, reminds once in the group, then plans the class after", async () => {
  const {gateway, sessions, reminder, pending, elapse, texts} = setup()
  reminder.start()
  await tick()
  assert.deepEqual(pending().map((t) => t.ms), [6 * HOUR], "never sleeps longer than the cap")
  await elapse() // 16:00 Wed
  assert.deepEqual(texts(), [])
  for (let i = 0; i < 24; i++) await elapse() // 6 h steps until Tue 22nd 16:00
  assert.deepEqual(texts(), [])
  assert.deepEqual(pending().map((t) => t.ms), [2.5 * HOUR], "the last step lands exactly at 18:30")
  await elapse()
  assert.deepEqual(texts(), ["The class starts in 30 minutes."])
  assert.deepEqual(gateway.sent[0].chat, GROUP)
  assert.equal(sessions.get("2026-09-22").remindedAt, "2026-09-22T18:30:00.000Z")
  assert.equal(pending().length, 1, "already planning the 29th")
  reminder.reschedule()
  await tick()
  assert.equal(texts().length, 1, "re-planning inside the window does not repeat the reminder")
  reminder.stop()
  assert.equal(pending().length, 0)
})

test("a restart inside the window reminds at once; a bot restarted after the class stays quiet", async () => {
  const {reminder, texts, pending} = setup({start: "2026-09-22T18:45:00Z"})
  reminder.start()
  await tick()
  assert.deepEqual(texts(), ["The class starts in 30 minutes."])
  const {reminder: late, texts: lateTexts} = setup({start: "2026-09-22T19:05:00Z"})
  late.start()
  await tick()
  assert.deepEqual(lateTexts(), [])
  assert.equal(pending().length, 1)
})

test("cancelled and moved classes: the reminder follows the calendar", async () => {
  const {sessions, reminder, at, texts} = setup({start: "2026-09-22T18:45:00Z"})
  sessions.save({...newSession("2026-09-22"), status: "cancelled", movedTo: "2026-09-29"})
  reminder.start()
  await tick()
  assert.deepEqual(texts(), [], "no reminder for a cancelled class")
  sessions.save({...newSession("2026-09-22"), status: "moved", movedTo: "2026-09-23"})
  sessions.save({...newSession("2026-09-23"), time: "20:00"})
  at("2026-09-23T19:20:00Z")
  reminder.reschedule()
  await tick()
  assert.deepEqual(texts(), [], "the moved class starts at 20:00 - not yet")
  at("2026-09-23T19:31:00Z")
  reminder.reschedule()
  await tick()
  assert.deepEqual(texts(), ["The class starts in 30 minutes."])
})

test("no schedule or lead 0: nothing is planned", async () => {
  const {reminder, pending} = setup({schedule: null})
  reminder.start()
  await tick()
  assert.equal(pending().length, 0)
  const {reminder: off, pending: offPending, texts} = setup({leadMs: 0, start: "2026-09-22T18:45:00Z"})
  off.start()
  await tick()
  assert.equal(offPending().length, 0)
  assert.deepEqual(texts(), [])
  assert.equal(off.describe(), "no reminders")
})

test("the reminder names the class's topic when there is one", async () => {
  const {sessions, reminder, elapse, texts, at} = setup()
  sessions.save({...newSession("2026-09-22"), topic: "Substance"})
  at("2026-09-22T18:00:00Z")
  reminder.start()
  await tick()
  await elapse()
  assert.deepEqual(texts(), ["The class starts in 30 minutes: Substance."])
})
