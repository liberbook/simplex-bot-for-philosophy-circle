import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {flattenArchive} from "../../src/storage/flattenArchive.js"
import {FolderFileStore} from "../../src/storage/FolderFileStore.js"
import {SessionStore} from "../../src/storage/SessionStore.js"
import {newSession} from "../../src/domain/Session.js"
import {silentLogger} from "../../src/util/logger.js"

const NOW = new Date("2026-09-20T09:00:00Z")

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-flatten-"))
  const store = new FolderFileStore(path.join(dir, "files"))
  const deleted = new FolderFileStore(path.join(dir, "deleted"))
  store.ensure()
  deleted.ensure()
  const sessions = new SessionStore(path.join(dir, "state", "sessions.json"))
  const write = (base, rel) => {
    fs.mkdirSync(path.dirname(path.join(base.dir, rel)), {recursive: true})
    fs.writeFileSync(path.join(base.dir, rel), rel)
  }
  return {store, deleted, sessions, write}
}

test("an archive written by an older version: files lifted to the root, card references rewritten, deleted class files remembered", () => {
  const {store, deleted, sessions, write} = setup()
  const ref = (name, kind = "reading") => ({name, kind, addedAt: "2026-09-01T00:00:00Z", author: "sam"})
  write(store, "2026-09-19/reading.pdf")
  write(store, "2026-09-19/questions.pdf")
  write(store, "reading.pdf") // a root file with the same name: the lifted one gets a timestamp
  write(store, "2026-08-29/lecture.mp3")
  write(deleted, "2026-09-12/old.pdf")
  write(deleted, "loose.pdf")
  sessions.save({...newSession("2026-09-19"), files: [ref("2026-09-19/reading.pdf"), ref("2026-09-19/questions.pdf"), ref("2026-09-19/lost.pdf")]})
  sessions.save({...newSession("2026-08-29"), files: [ref("2026-08-29/lecture.mp3", "audio")]})
  sessions.save(newSession("2026-09-12"))

  const result = flattenArchive({store, deleted, sessions, logger: silentLogger, now: NOW})
  assert.deepEqual(result, {files: 3, deleted: 1, references: 4})
  assert.deepEqual(store.list().map((f) => f.name), ["lecture.mp3", "questions.pdf", "reading.20260920-090000.pdf", "reading.pdf"])
  assert.equal(fs.readFileSync(path.join(store.dir, "reading.pdf"), "utf8"), "reading.pdf", "the root's own file is untouched")
  assert.deepEqual(fs.readdirSync(store.dir).filter((n) => fs.statSync(path.join(store.dir, n)).isDirectory()), [], "class folders are gone")
  assert.deepEqual(sessions.get("2026-09-19").files.map((f) => f.name), ["reading.20260920-090000.pdf", "questions.pdf", "lost.pdf"])
  assert.deepEqual(sessions.get("2026-08-29").files.map((f) => [f.name, f.kind]), [["lecture.mp3", "audio"]])
  assert.deepEqual(deleted.list().map((f) => f.name), ["loose.pdf", "old.pdf"])
  assert.deepEqual(sessions.get("2026-09-12").deletedFiles.map((f) => [f.name, f.kind]), [["old.pdf", "reading"]], "restorable to its class")

  assert.deepEqual(flattenArchive({store, deleted, sessions, logger: silentLogger, now: NOW}), {files: 0, deleted: 0, references: 0}, "idempotent")
})

test("a deleted class file whose class is unknown is lifted and simply forgotten", () => {
  const {store, deleted, sessions, write} = setup()
  write(deleted, "2026-01-01/x.pdf")
  assert.deepEqual(flattenArchive({store, deleted, sessions, logger: silentLogger, now: NOW}), {files: 0, deleted: 1, references: 0})
  assert.deepEqual(deleted.list().map((f) => f.name), ["x.pdf"])
  assert.deepEqual(sessions.list(), [])
})
