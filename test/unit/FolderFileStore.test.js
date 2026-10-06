import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {FolderFileStore, timestampedName} from "../../src/storage/FolderFileStore.js"

function tempStore(files = [["b.pdf", 3], ["A.txt", 5], ["c.PDF", 1]]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-store-"))
  for (const [name, size] of files) fs.writeFileSync(path.join(dir, name), "x".repeat(size))
  fs.mkdirSync(path.join(dir, "subdir"))
  return {store: new FolderFileStore(dir), dir}
}

test("lists regular files sorted by name with sizes, ignoring directories", () => {
  const {store} = tempStore()
  assert.deepEqual(store.list().map((f) => [f.name, f.size]), [["A.txt", 5], ["b.pdf", 3], ["c.PDF", 1]])
  assert.deepEqual(store.list("*.pdf").map((f) => f.name), ["b.pdf", "c.PDF"])
})

test("exact and find: exact name first (case-insensitive), then glob", () => {
  const {store} = tempStore()
  assert.deepEqual(store.exact("B.PDF").map((f) => f.name), ["b.pdf"])
  assert.deepEqual(store.exact("*.pdf"), [])
  assert.deepEqual(store.find("B.PDF").map((f) => f.name), ["b.pdf"])
  assert.deepEqual(store.find("*.pdf").map((f) => f.name), ["b.pdf", "c.PDF"])
  assert.deepEqual(store.find("nope"), [])
})

test("pathOf only resolves stored names, never arbitrary paths", () => {
  const {store, dir} = tempStore()
  assert.equal(store.pathOf("b.pdf"), path.join(dir, "b.pdf"))
  assert.throws(() => store.pathOf("../etc/passwd"))
  assert.throws(() => store.pathOf("subdir"))
})

test("moveTo moves a file intact, renames on collision and stamps the move time", () => {
  const {store} = tempStore()
  const {store: trash} = tempStore([["b.pdf", 9]])
  const when = new Date("2026-09-07T18:12:03Z")
  assert.equal(store.moveTo("A.txt", trash, when), "A.txt")
  assert.deepEqual(store.list().map((f) => f.name), ["b.pdf", "c.PDF"])
  const moved = trash.list().find((f) => f.name === "A.txt")
  assert.equal(moved.size, 5)
  assert.equal(moved.modifiedAt.getTime(), when.getTime())
  assert.equal(store.moveTo("b.pdf", trash, when), "b.20260907-181203.pdf") // b.pdf already there
  assert.throws(() => store.moveTo("missing.txt", trash))
  assert.throws(() => store.moveTo("../x", trash))
})

test("timestampedName and counters", () => {
  const when = new Date("2026-09-07T18:12:03Z")
  assert.equal(timestampedName("report.pdf", when), "report.20260907-181203.pdf")
  assert.equal(timestampedName("notes", when), "notes.20260907-181203")
  assert.equal(timestampedName("a.tar.gz", when, 2), "a.tar.20260907-181203-2.gz")
})

test("purgeOlderThan removes only files older than the age", () => {
  const {store, dir} = tempStore([["old.pdf", 1], ["new.pdf", 1]])
  const now = Date.now()
  fs.utimesSync(path.join(dir, "old.pdf"), new Date(now - 40 * 86_400_000), new Date(now - 40 * 86_400_000))
  assert.deepEqual(store.purgeOlderThan(30 * 86_400_000, now), ["old.pdf"])
  assert.deepEqual(store.list().map((f) => f.name), ["new.pdf"])
})

test("missing folder lists as empty and ensure creates it", () => {
  const dir = path.join(os.tmpdir(), `spinoza-missing-${process.pid}`)
  const store = new FolderFileStore(dir)
  assert.deepEqual(store.list(), [])
  store.ensure()
  assert.ok(fs.existsSync(dir))
  fs.rmSync(dir, {recursive: true})
})

test("flatten lifts the files of the old class folders to the root with collision-safe names and removes the folders", () => {
  const {store, dir} = tempStore([["reading.pdf", 2]])
  for (const [folder, name] of [["2026-09-15", "reading.pdf"], ["2026-09-15", "lecture.mp3"], ["2026-09-22", "notes.pdf"]]) {
    fs.mkdirSync(path.join(dir, folder), {recursive: true})
    fs.writeFileSync(path.join(dir, folder, name), folder)
  }
  fs.mkdirSync(path.join(dir, ".hidden"))
  fs.writeFileSync(path.join(dir, ".hidden", "x.pdf"), "x")
  for (const folder of ["books", "state"]) {
    fs.mkdirSync(path.join(dir, folder))
    fs.writeFileSync(path.join(dir, folder, `${folder}.json`), "{}")
  }
  assert.deepEqual(store.list().map((f) => f.name), ["reading.pdf"], "before: subfolders are invisible")
  const when = new Date("2026-09-07T18:12:03Z")
  const moved = store.flatten(when)
  assert.deepEqual([...moved], [["2026-09-15/lecture.mp3", "lecture.mp3"], ["2026-09-15/reading.pdf", "reading.20260907-181203.pdf"], ["2026-09-22/notes.pdf", "notes.pdf"]])
  assert.deepEqual(store.list().map((f) => f.name), ["lecture.mp3", "notes.pdf", "reading.20260907-181203.pdf", "reading.pdf"])
  assert.equal(fs.readFileSync(path.join(dir, "reading.pdf"), "utf8"), "xx", "the root's own file is untouched")
  assert.equal(fs.existsSync(path.join(dir, "2026-09-15")), false)
  assert.equal(fs.existsSync(path.join(dir, "2026-09-22")), false)
  assert.ok(fs.existsSync(path.join(dir, ".hidden", "x.pdf")), "hidden folders are left alone")
  assert.ok(fs.existsSync(path.join(dir, "books", "books.json")) && fs.existsSync(path.join(dir, "state", "state.json")), "only YYYY-MM-DD class folders are touched")
  assert.ok(fs.existsSync(path.join(dir, "subdir")), "an empty folder is removed only when it held our files")
  assert.deepEqual([...store.flatten(when)], [], "nothing left to do")
})

test("the used size is counted again when the folder changes, and at least once a minute", () => {
  const {store, dir} = tempStore([["a.pdf", 3]])
  const t = Date.now()
  assert.equal(store.usedBytes(t), 3)
  fs.writeFileSync(path.join(dir, "b.pdf"), "12345")
  assert.equal(store.usedBytes(t), 8, "a new file changes the folder")
  fs.appendFileSync(path.join(dir, "a.pdf"), "xx") // written in place: the folder does not change
  assert.equal(store.usedBytes(t + 61_000), 10)
})
