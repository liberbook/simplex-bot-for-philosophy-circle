import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {SessionStore} from "../../src/storage/SessionStore.js"
import {SubscriberStore} from "../../src/storage/SubscriberStore.js"
import {ClassSchedule} from "../../src/domain/ClassSchedule.js"
import {newSession} from "../../src/domain/Session.js"

const tempFile = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-sessions-")), "state", name)

test("sessions and schedule persist and are found by post and by file", () => {
  const store = new SessionStore(tempFile("sessions.json"), {timezone: "Europe/Moscow"})
  assert.equal(store.getSchedule(), null)
  assert.deepEqual(store.list(), [])
  store.setSchedule(ClassSchedule.parse("вт 19:00", "Europe/Moscow"))
  assert.equal(store.getSchedule().timezone, "Europe/Moscow")
  assert.equal(store.getSchedule().weekday, 2)

  const s = newSession("2026-09-15", new Date("2026-09-07T10:00:00Z"))
  s.posts.push({itemId: 5, groupId: 1, author: "alice", text: "read", sentAt: "2026-09-07T10:00:00Z", editedAt: null})
  s.files.push({name: "reading.pdf", kind: "reading", addedAt: "2026-09-07T10:01:00Z", author: "alice"})
  store.save(s, new Date("2026-09-07T10:02:00Z"))
  store.save(newSession("2026-09-08"))
  assert.deepEqual(store.list().map((x) => x.date), ["2026-09-08", "2026-09-15"])
  assert.equal(store.get("2026-09-15").updatedAt, "2026-09-07T10:02:00.000Z")
  assert.equal(store.findByPost(1, 5).date, "2026-09-15")
  assert.equal(store.findByPost(2, 5), null)
  assert.equal(store.findByFile("reading.pdf").date, "2026-09-15")
  assert.equal(new SessionStore(store.filePath).get("2026-09-15").posts.length, 1) // survives a restart
  store.remove("2026-09-08")
  assert.deepEqual(store.list().map((x) => x.date), ["2026-09-15"])
  store.remove("never-there")
})

test("deleted references: found, renamed from the old folder names, forgotten when purged", () => {
  const store = new SessionStore(tempFile("sessions.json"))
  const file = (name, kind = "reading") => ({name, kind, addedAt: "2026-09-07T10:01:00Z", author: "alice"})
  store.save({...newSession("2026-09-15"), files: [file("2026-09-15/reading.pdf"), file("loose.pdf")], deletedFiles: [file("2026-09-15/old.pdf")]})
  fs.writeFileSync(store.filePath, fs.readFileSync(store.filePath, "utf8").replace(/,\n\s*"deletedFiles": \[\]/, "")) // a file from before the field existed
  store.save({...newSession("2026-09-22"), files: [file("2026-09-22/lecture.mp3", "audio")]})
  assert.deepEqual(store.get("2026-09-22").deletedFiles, [])
  assert.equal(store.findByDeletedFile("2026-09-15/old.pdf").date, "2026-09-15")
  assert.equal(store.findByDeletedFile("nope.pdf"), null)

  const warnings = []
  const renamed = new Map([["2026-09-15/reading.pdf", "reading.20260907-181203.pdf"], ["2026-09-22/lecture.mp3", "lecture.mp3"]])
  assert.equal(store.renameFiles(renamed, {logger: {warn: (m) => warnings.push(m)}}), 3)
  assert.deepEqual(store.get("2026-09-15").files.map((f) => f.name), ["reading.20260907-181203.pdf", "loose.pdf"])
  assert.deepEqual(store.get("2026-09-15").deletedFiles.map((f) => f.name), ["old.pdf"], "not on disk: the bare name")
  assert.deepEqual(store.get("2026-09-22").files.map((f) => f.name), ["lecture.mp3"])
  assert.equal(warnings.length, 1)
  assert.equal(store.renameFiles(renamed), 0, "nothing left to rename")

  store.forgetDeletedFiles(["old.pdf", "other.pdf"])
  assert.deepEqual(store.get("2026-09-15").deletedFiles, [])
  store.forgetDeletedFiles([])
})

test("subscribers are set on and off explicitly", () => {
  const subs = new SubscriberStore(tempFile("subscribers.json"))
  assert.equal(subs.set({contactId: 3, name: "alice"}, true), true)
  assert.equal(subs.set({contactId: 3, name: "alice"}, true), false, "already on: nothing changed")
  assert.equal(subs.has(3), true)
  assert.equal(subs.set({contactId: 4, name: "bob"}, true), true)
  assert.equal(subs.set({contactId: 3, name: "alice"}, false), true)
  assert.equal(subs.set({contactId: 3, name: "alice"}, false), false)
  assert.deepEqual(subs.list().map((s) => s.name), ["bob"])
})
