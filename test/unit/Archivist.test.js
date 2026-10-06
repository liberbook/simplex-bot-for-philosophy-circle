import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {Archivist} from "../../src/bot/Archivist.js"
import {WatchedGroups} from "../../src/bot/WatchedGroups.js"
import {TriggerWord} from "../../src/bot/TriggerWord.js"
import {StorageQuota} from "../../src/bot/StorageQuota.js"
import {silentLogger} from "../../src/util/logger.js"
import {FolderFileStore} from "../../src/storage/FolderFileStore.js"
import {FakeGateway, GROUP, OTHER_GROUP, groupMessage, offer} from "./helpers.js"

const fakeStore = (used = 0, diskFree = null) => ({usedBytes: () => used, freeDiskBytes: () => diskFree, exact: () => []})

function archivist(gatewayOptions = {}, quota = new StorageQuota(fakeStore(), 10 * 1024), store = fakeStore()) {
  const gateway = new FakeGateway({groups: [GROUP, OTHER_GROUP], ...gatewayOptions})
  const groups = new WatchedGroups(gateway, "filedrop")
  return {gateway, quota, archivist: new Archivist({gateway, groups, quota, store, logger: silentLogger, rule: new TriggerWord("conatus")})}
}

test("a post deleted for everyone moves its archived file to the deleted folder", () => {
  const store = new FolderFileStore(fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-arch-")))
  const deleted = new FolderFileStore(fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-del-")))
  const gateway = new FakeGateway({groups: [GROUP, OTHER_GROUP]})
  const a = new Archivist({gateway, groups: new WatchedGroups(gateway, "filedrop"), quota: new StorageQuota(store, 10 * 1024), store, deleted, logger: silentLogger, rule: new TriggerWord("conatus")})
  fs.writeFileSync(path.join(store.dir, "reading.pdf"), "x")
  fs.writeFileSync(path.join(deleted.dir, "reading.pdf"), "older")
  const moved = a.onMessageDeleted(groupMessage({file: offer({name: "reading.pdf", status: "rcvComplete", path: "reading.pdf"})}))
  assert.equal(moved.name, "reading.pdf")
  assert.match(moved.storedAs, /^reading\.\d{8}-\d{6}\.pdf$/, "the name in the deleted folder, timestamped on collision")
  assert.deepEqual(store.list(), [])
  assert.deepEqual(deleted.list().map((f) => f.name).sort(), [moved.storedAs, "reading.pdf"].sort())
  assert.equal(a.onMessageDeleted(groupMessage({file: offer({name: "unknown.pdf", path: "unknown.pdf"})})), null)
  assert.equal(a.onMessageDeleted(groupMessage({text: "just text"})), null)
  assert.equal(a.onMessageDeleted(groupMessage({chat: OTHER_GROUP, file: offer({name: "reading.pdf"})})), null)
})

test("save() with a claim marks the file for the Curator and keeps it at the root; nothing is said", async () => {
  const store = new FolderFileStore(fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-arch-")))
  const {gateway, archivist: a} = archivist({}, new StorageQuota(store, 10 * 1024), store)
  assert.deepEqual(await a.save(offer(), groupMessage(), {claim: true}), {ok: true})
  assert.deepEqual(await a.save(offer(), groupMessage()), {ok: false, reason: "downloading"})
  assert.deepEqual(await a.save(offer(), groupMessage(), {claim: true}), {ok: true}, "already downloading: a class may still claim it")
  assert.deepEqual(await a.save(offer({status: "rcvTransfer", path: "report.pdf"}), groupMessage(), {claim: true}), {ok: true}, "the CLI now reports it in transfer - still ours")
  assert.equal(a.isDownloading(7), true)
  assert.equal(a.isDownloading(8), false)
  assert.deepEqual(a.locate(offer()), {state: "downloading"})
  fs.writeFileSync(path.join(store.dir, "report.pdf"), "x")
  assert.deepEqual(a.onFileReceived(offer({path: "report.pdf"})), {file: offer({path: "report.pdf"}), storedAs: "report.pdf"})
  assert.deepEqual(store.list().map((f) => f.name), ["report.pdf"])
  assert.deepEqual(a.locate(offer({path: "report.pdf", status: "rcvComplete"})), {state: "kept", name: "report.pdf"})
  assert.deepEqual(a.locate(offer({id: 8, name: "gone.pdf", path: "gone.pdf"})), {state: "missing", name: "gone.pdf"})
  assert.equal(a.onFileReceived(offer({id: 99})), null, "not ours")
  assert.deepEqual(gateway.sent, [], "saving is silent")
})

test("every file posted in a watched group is kept, silently; other groups and own messages are not", async () => {
  const {gateway, archivist: a} = archivist()
  await a.handle(groupMessage({text: "", file: offer()}))
  await a.handle(groupMessage({text: "fyi", file: offer({id: 8, name: "b.pdf"})}))
  await a.handle(groupMessage({text: "", file: offer({id: 9}), chat: OTHER_GROUP}))
  await a.handle(groupMessage({text: "", file: offer({id: 10}), incoming: false}))
  await a.handle(groupMessage({text: "", file: offer({id: 11, status: "rcvComplete"})}))
  await a.handle(groupMessage({text: "conatus"})) // a request, not a file: the Courier's
  assert.deepEqual(gateway.received, [7, 8])
  a.onFileReceived(offer({status: "rcvComplete", path: "report.pdf"}))
  a.onFileFailed(offer({id: 8, name: "b.pdf"}), "sender gone")
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(gateway.sent, [])
})

test("does not request the same file twice while it downloads, and forgets it once received", async () => {
  const {gateway, quota, archivist: a} = archivist()
  await a.handle(groupMessage({file: offer()}))
  await a.handle(groupMessage({file: offer()}))
  assert.deepEqual(gateway.received, [7])
  a.onFileReceived(offer({status: "rcvComplete"}))
  assert.equal(quota.isReserved(7), false)
})

test("a download that never completes can be retried once its reservation expired", async () => {
  let now = 0
  const quota = new StorageQuota(fakeStore(), 10 * 1024, {staleAfterMs: 3_600_000, clock: () => now})
  const {gateway, archivist: a} = archivist({}, quota)
  await a.handle(groupMessage({file: offer()}))
  now = 30 * 60_000
  await a.handle(groupMessage({file: offer()}))
  assert.deepEqual(gateway.received, [7], "not re-requested before the timeout")
  now = 3_600_000 + 1
  await a.handle(groupMessage({file: offer()}))
  assert.deepEqual(gateway.received, [7, 7])
})

test("files with path-like or control-character names are refused - in the log only", async () => {
  const {gateway, archivist: a} = archivist()
  for (const name of ["/etc/cron.d/x", "..\\evil", ".hidden", "bad\nname.pdf", ""]) {
    await a.handle(groupMessage({file: offer({id: 50, name})}))
  }
  assert.deepEqual(gateway.received, [])
  assert.deepEqual(gateway.sent, [])
  await a.handle(groupMessage({file: offer({name: "Гольбах Система природы.pdf"})}))
  assert.deepEqual(gateway.received, [7])
})

test("a failed accept can be retried", async () => {
  const {gateway, archivist: a} = archivist()
  gateway.receiveResult = {ok: false, reason: "boom"}
  await a.handle(groupMessage({file: offer()}))
  gateway.receiveResult = {ok: true}
  await a.handle(groupMessage({file: offer()}))
  assert.deepEqual(gateway.received, [7, 7])
})

test("files beyond the storage limit are refused - in the log only", async () => {
  const {gateway, archivist: a} = archivist({}, new StorageQuota(fakeStore(9 * 1024), 10 * 1024))
  await a.handle(groupMessage({file: offer({size: 2048})}))
  assert.deepEqual(gateway.received, [])
  assert.deepEqual(gateway.sent, [])
  await a.handle(groupMessage({file: offer({size: 1024})}))
  assert.deepEqual(gateway.received, [7])
})

test("a group is matched by its title when the local name got a suffix", async () => {
  const {gateway, archivist: a} = archivist()
  await a.handle(groupMessage({file: offer(), chat: {type: "group", id: 3, name: "filedrop_1", title: "filedrop"}}))
  assert.deepEqual(gateway.received, [7])
})

test("findRequested: a reply names the quoted post's file; a bare comment the latest file before it, or the one it names; a sentence is talk", async () => {
  const recent = [
    groupMessage({itemId: 30, text: "", file: offer({id: 1, name: "first.pdf"})}),
    groupMessage({itemId: 31, text: "", file: offer({id: 2, name: "second.pdf", status: "rcvComplete", path: "second.pdf"})}),
    groupMessage({itemId: 33, text: "", file: offer({id: 4, name: "mine.pdf"}), incoming: false}),
    groupMessage({itemId: 40, text: "", file: offer({id: 5, name: "later.pdf"})}),
  ]
  const quoted = groupMessage({itemId: 32, text: "", file: offer({id: 9, name: "notes.txt"})})
  const {archivist: a} = archivist({recent, items: {"1:32": quoted, "1:29": groupMessage({itemId: 29, text: "just text"})}})
  const id = async (m) => (await a.findRequested(m))?.file?.id
  assert.equal(await id(groupMessage({itemId: 33, text: "conatus", quotedItemId: 32})), 9)
  assert.equal(await id(groupMessage({itemId: 35, text: "Conatus!"})), 2, "the latest file from someone else before the comment - saved or not")
  assert.equal(await id(groupMessage({itemId: 36, text: "conatus first.pdf"})), 1, "a named file wins")
  assert.deepEqual(await a.findRequested(groupMessage({itemId: 37, text: "conatus", quotedItemId: 29})), {file: null}, "a reply to a post without a file")
  assert.deepEqual(await a.findRequested(groupMessage({itemId: 37, text: "conatus", quotedItemId: 999})), {file: null}, "a reply to a post the bot never got")
  assert.equal(await a.findRequested(groupMessage({itemId: 38, text: "conatus у Спинозы - это стремление"})), null, "a sentence that merely uses the word")
  assert.equal(await a.findRequested(groupMessage({itemId: 38, text: "yes, conatus", quotedItemId: 32})), null, "a sentence in a reply")
  assert.equal(await a.findRequested(groupMessage({itemId: 39, text: "thanks"})), null)
  assert.equal(await a.findRequested(groupMessage({itemId: 39, text: "conatus", chat: OTHER_GROUP})), null, "not a watched group")
  const {archivist: empty} = archivist()
  assert.deepEqual(await empty.findRequested(groupMessage({itemId: 35, text: "conatus"})), {file: null}, "no file near it")
})

test("the start-up scan keeps files posted while the bot was offline, silently", async () => {
  const recent = [
    groupMessage({itemId: 30, text: "", file: offer({id: 3, name: "done.pdf", status: "rcvComplete"})}),
    groupMessage({itemId: 31, text: "conatus"}),
    groupMessage({itemId: 33, text: "", file: offer({id: 9, name: "../x.pdf"})}),
    groupMessage({itemId: 34, text: "", file: offer({id: 5, name: "missed.pdf"})}),
  ]
  const {gateway, archivist: a} = archivist({recent})
  await a.scan(20)
  assert.deepEqual(gateway.received, [5])
  assert.deepEqual(gateway.sent, [])
})

test("a comment names a file only by its whole name with the extension", async () => {
  const recent = [
    groupMessage({itemId: 30, file: offer({id: 1, name: "conatus"})}),
    groupMessage({itemId: 31, file: offer({id: 2, name: "report.pdf"})}),
  ]
  const {archivist: a} = archivist({recent})
  assert.equal(await a.findRequested(groupMessage({itemId: 40, text: "Spinoza's conatus is striving"})), null, "a file called like the word does not turn a sentence into a request")
  assert.equal((await a.findRequested(groupMessage({itemId: 40, text: "conatus report.pdf please"}))).file.id, 2)
  assert.equal(await a.findRequested(groupMessage({itemId: 40, text: "conatus myreport.pdfx"})), null)
})
