import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {Administrator} from "../../src/bot/Administrator.js"
import {AdminPolicy} from "../../src/bot/AdminPolicy.js"
import {AdminRegistry} from "../../src/storage/AdminRegistry.js"
import {StorageQuota} from "../../src/bot/StorageQuota.js"
import {RateLimiter} from "../../src/bot/RateLimiter.js"
import {FolderFileStore} from "../../src/storage/FolderFileStore.js"
import {WatchedGroups} from "../../src/bot/WatchedGroups.js"
import {GroupMembersOnly, OpenAccess} from "../../src/bot/AccessPolicy.js"
import {Listings} from "../../src/bot/Listings.js"
import {UnknownCommands} from "../../src/bot/UnknownCommands.js"
import {Logger, silentLogger} from "../../src/util/logger.js"
import {redactSecrets} from "../../src/util/redact.js"
import {createReplies} from "../../src/bot/replies.js"
import {FakeGateway, GROUP, directMessage} from "./helpers.js"

const replies = createReplies("en")
const BOB = {contactId: 4, name: "bob"}
const bobMessage = (text) => directMessage(text, {sender: BOB, chat: {type: "direct", id: 4, name: "bob"}})

function setup({secret = "s3cret", groupRoles = [], members = {}, membersOnly = false, files = ["report.pdf", "notes.txt"], logger = silentLogger} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-admin-"))
  const archive = path.join(dir, "archive")
  fs.mkdirSync(archive)
  for (const f of files) fs.writeFileSync(path.join(archive, f), "1234")
  const gateway = new FakeGateway({groups: [GROUP], members})
  const store = new FolderFileStore(archive)
  const deleted = new FolderFileStore(path.join(dir, "deleted"))
  const registry = new AdminRegistry(path.join(dir, "state", "admins.json"))
  const admins = new AdminPolicy({registry, gateway, groups: new WatchedGroups(gateway, "filedrop"), groupRoles, secret})
  const quota = new StorageQuota(store, 1024)
  let now = 1_700_000_000_000
  const clock = () => now
  const adminAttempts = new RateLimiter({limit: 5, windowMs: 3_600_000, clock})
  const access = membersOnly ? new GroupMembersOnly(gateway, new WatchedGroups(gateway, "filedrop")) : new OpenAccess()
  const listings = new Listings()
  const unknown = new UnknownCommands()
  const administrator = new Administrator({
    gateway, store, deleted, access, listings, unknown, admins, quota, groups: new WatchedGroups(gateway, "filedrop"), replies, logger,
    adminAttempts, retentionMs: 30 * 86_400_000, about: {version: "1.1.0 (abc)", startedAt: now - 90 * 60_000}, clock,
  })
  const lastReply = () => gateway.sent.at(-1).text
  const become = () => administrator.handle(directMessage("/admin s3cret"))
  return {gateway, store, deleted, registry, admins, administrator, listings, unknown, lastReply, become, advance: (ms) => (now += ms)}
}

test("non-admin commands are not consumed; admin commands are", async () => {
  const {administrator} = setup()
  assert.equal(await administrator.handle(directMessage("/list")), false)
  assert.equal(await administrator.handle(directMessage("/space")), true)
  assert.equal(await administrator.handle(directMessage("/space", {incoming: false})), false)
})

test("promotion with the secret, persisted; wrong secret refused; nothing secret in the logs", async () => {
  const lines = []
  const logger = new Logger({verbose: true, out: {log: (l) => lines.push(l), error: (l) => lines.push(l)}, redact: redactSecrets})
  const {administrator, registry, lastReply} = setup({logger})
  await administrator.handle(directMessage("/admin nope"))
  assert.equal(lastReply(), "Wrong secret.")
  assert.equal(registry.has(3), false)
  await administrator.handle(directMessage("/admin s3cret"))
  assert.match(lastReply(), /you are an admin now/)
  assert.equal(registry.has(3), true)
  assert.equal(new AdminRegistry(registry.filePath).has(3), true) // survives a restart
  await administrator.handle(directMessage("/admin s3cret"))
  assert.equal(lastReply(), "You are already an admin.")
  assert.ok(lines.length > 0)
  assert.ok(lines.every((l) => !l.includes("s3cret") && !l.includes("nope")), `secret leaked: ${lines.join(" | ")}`)
})

test("five wrong secrets lock /admin for an hour, even for the right secret", async () => {
  const {administrator, gateway, registry, lastReply, advance} = setup()
  for (let i = 0; i < 5; i++) {
    await administrator.handle(directMessage(`/admin wrong${i}`))
    assert.equal(lastReply(), "Wrong secret.")
  }
  await administrator.handle(directMessage("/admin s3cret"))
  assert.match(lastReply(), /Too many wrong secrets/)
  assert.equal(registry.has(3), false)
  const sent = gateway.sent.length
  await administrator.handle(directMessage("/admin s3cret"))
  assert.equal(gateway.sent.length, sent, "further attempts are silent")
  advance(3_600_000 + 1)
  await administrator.handle(directMessage("/admin s3cret"))
  assert.match(lastReply(), /you are an admin now/)
})

test("promotion is impossible without a configured secret", async () => {
  const {administrator, lastReply} = setup({secret: ""})
  await administrator.handle(directMessage("/admin anything"))
  assert.match(lastReply(), /not configured/)
})

test("maintenance commands are for members (no admin rights needed); admin commands stay admin-only", async () => {
  const members = {1: [{contactId: 3, name: "alice", status: "connected"}]} // bob is not a member
  const {administrator, store, lastReply} = setup({membersOnly: true, members})
  await administrator.handle(bobMessage("/delete report.pdf"))
  assert.match(lastReply(), /only members/)
  await administrator.handle(bobMessage("/space"))
  assert.match(lastReply(), /only members/)
  assert.equal(store.list().length, 2)
  await administrator.handle(directMessage("/space"))
  assert.match(lastReply(), /^STORAGE\n\nArchive: 8 B of 1\.0 KiB/)
  await administrator.handle(directMessage("/status"))
  assert.match(lastReply(), /^STATUS\n\nspinoza/)
  await administrator.handle(directMessage("/admins"))
  assert.match(lastReply(), /admins only/)
  await administrator.handle(bobMessage("/admins"))
  assert.match(lastReply(), /admins only/)
})

test("/delete moves exactly one file by exact name; patterns and ambiguity are refused", async () => {
  const {administrator, store, deleted, lastReply} = setup({files: ["report.pdf", "notes.txt", "Notes.md", "a.bin", "b.bin"]})
  await administrator.handle(directMessage("/delete"))
  assert.equal(lastReply(), "Give the file's number or exact name, one at a time.\n\nExample: /delete 3\nList: /files")
  await administrator.handle(directMessage("/delete nope"))
  assert.match(lastReply(), /^There is no file "nope"\.\n\nList: \/files$/)
  await administrator.handle(directMessage("/delete *.pdf"))
  assert.equal(lastReply(), "FOUND · 1 · *.pdf\n\n1. report.pdf\n\nDelete: /delete 1")
  await administrator.handle(directMessage("/delete *.bin"))
  assert.match(lastReply(), /^FOUND · 2 · \*\.bin\n\n1\. \w\.bin\n2\. \w\.bin\n\nDelete one at a time: \/delete <number>$/)
  assert.equal(store.list().length, 5, "nothing moved on a pattern")
  const second = lastReply().split("\n")[3].slice(3)
  await administrator.handle(directMessage("/delete 2"))
  assert.match(lastReply(), new RegExp(`^Moved "${second}" to the deleted folder`), "the numbers of the choice work right away")
  await administrator.handle(directMessage(`/restore ${second}`))
  assert.equal(store.list().length, 5)

  await administrator.handle(directMessage("/delete REPORT.pdf"))
  assert.equal(lastReply(), 'Moved "report.pdf" to the deleted folder.\n\nBring back: /restore 1\nDeleted folder: /deleted')
  assert.deepEqual(store.list().map((f) => f.name), ["a.bin", "b.bin", "Notes.md", "notes.txt"])
  assert.deepEqual(deleted.list().map((f) => [f.name, f.size]), [["report.pdf", 4]])

  await administrator.handle(directMessage("/deleted"))
  assert.match(lastReply(), /^DELETED · 1 · newest first\n\n1\. report\.pdf · 4 B · \d{2}\.\d{2}\.\d{4}\n\nBring back: \/restore <number>\nHelp: \/files \?$/)
  await administrator.handle(directMessage("/space"))
  assert.match(lastReply(), /^STORAGE\n\nArchive: 16 B of 1\.0 KiB\nFree in the archive: 1008 B\n\nDeleted folder: 4 B · 1 file\nKept for: 30 days\n\nFree disk space: /, "no file count on the archive line, no zeros")

  await administrator.handle(directMessage("/restore report.pdf"))
  assert.equal(lastReply(), 'Restored "report.pdf" to the archive.\n\nList: /files')
  assert.equal(deleted.list().length, 0)
  assert.equal(store.list().length, 5)
  await administrator.handle(directMessage("/restore report.pdf"))
  assert.match(lastReply(), /^There is no deleted file "report\.pdf"\.\n\nDeleted folder: \/deleted$/)
})

test("/delete and /restore accept the number from the list last shown (/list for the archive, /deleted for the folder)", async () => {
  const {administrator, store, deleted, listings, lastReply} = setup({files: ["a.bin", "b.bin", "c.bin"]})
  for (const [i, f] of ["a.bin", "b.bin", "c.bin"].entries()) fs.utimesSync(path.join(store.dir, f), new Date(2_000_000_000_000 - i * 60_000), new Date(2_000_000_000_000 - i * 60_000)) // a.bin newest
  listings.remember("archive", 3, ["c.bin", "b.bin", "a.bin"]) // what /list showed alice (chat id 3)
  await administrator.handle(directMessage("/delete 2"))
  assert.match(lastReply(), /^Moved "b\.bin" to the deleted folder/)
  assert.deepEqual(store.list().map((f) => f.name), ["a.bin", "c.bin"])
  await administrator.handle(directMessage("/delete 9"))
  assert.match(lastReply(), /no number 9 in the list - it has 3/)
  await administrator.handle(directMessage("/deleted"))
  assert.match(lastReply(), /1\. b\.bin/)
  await administrator.handle(directMessage("/restore 1"))
  assert.equal(lastReply(), 'Restored "b.bin" to the archive.\n\nList: /files')
  assert.equal(deleted.list().length, 0)
  // "/restore 1" right after a deletion brings back the file just deleted, even though the deleted list shown before is stale
  await administrator.handle(directMessage("/delete c.bin"))
  assert.match(lastReply(), /\n\nBring back: \/restore 1\n/)
  await administrator.handle(directMessage("/restore 1"))
  assert.match(lastReply(), /^Restored "c\.bin" to the archive/)
  // without a listing shown, numbers follow the current order (newest first; the restored b.bin carries the older test-clock time)
  await administrator.handle(directMessage("/delete 1", {sender: {contactId: 4, name: "bob"}, chat: {type: "direct", id: 4, name: "bob"}}))
  assert.match(lastReply(), /^Moved "a\.bin" to the deleted folder/)
})

test("/delete takes a class file off its card and /restore puts it back", async () => {
  const {administrator, store, lastReply} = setup({files: []})
  const {SessionStore} = await import("../../src/storage/SessionStore.js")
  const {newSession} = await import("../../src/domain/Session.js")
  const sessions = new SessionStore(path.join(path.dirname(store.dir), "state", "sessions.json"))
  fs.writeFileSync(path.join(store.dir, "reading.pdf"), "x")
  sessions.save({...newSession("2026-09-22"), files: [{name: "reading.pdf", kind: "reading", addedAt: "2026-09-16T10:00:00Z", author: "alice"}]})
  administrator.sessions = sessions
  await administrator.handle(directMessage("/delete reading.pdf"))
  assert.equal(lastReply(), 'Moved "reading.pdf" to the deleted folder.\nRemoved from the class of 22.09.2026.\n\nBring back: /restore 1\nDeleted folder: /deleted', "the card is named, and the number to bring it back is real")
  assert.deepEqual(sessions.get("2026-09-22").files, [], "the card no longer offers a file that is gone")
  assert.deepEqual(sessions.get("2026-09-22").deletedFiles.map((f) => [f.name, f.author]), [["reading.pdf", "alice"]], "remembered for /restore")
  await administrator.handle(directMessage("/restore reading.pdf"))
  assert.equal(lastReply(), 'Restored "reading.pdf" to the archive.\nBack on the class of 22.09.2026.\n\nList: /files')
  assert.deepEqual(sessions.get("2026-09-22").files.map((f) => [f.name, f.kind, f.author]), [["reading.pdf", "reading", "alice"]], "back on the card, as it was")
  assert.deepEqual(sessions.get("2026-09-22").deletedFiles, [])
  await administrator.handle(directMessage("/файлы удалить reading.pdf"))
  assert.match(lastReply(), /^Moved "reading\.pdf"/, "the /файлы section words work too")
  await administrator.handle(directMessage("/ф в 1"))
  assert.match(lastReply(), /^Restored "reading\.pdf"/)
})

test("deleting a name that already exists in the deleted folder keeps both, and old deleted files are purged", async () => {
  const {administrator, deleted, lastReply, advance} = setup({files: ["report.pdf"]})
  deleted.ensure()
  fs.writeFileSync(path.join(deleted.dir, "report.pdf"), "older")
  fs.utimesSync(path.join(deleted.dir, "report.pdf"), new Date(1_700_000_000_000), new Date(1_700_000_000_000)) // on the test clock
  await administrator.handle(directMessage("/delete report.pdf"))
  assert.match(lastReply(), /to the deleted folder as "report\.\d{8}-\d{6}\.pdf"/)
  assert.equal(deleted.list().length, 2)
  advance(31 * 86_400_000)
  assert.equal(administrator.purgeDeleted().length, 2)
  assert.equal(deleted.list().length, 0)
})

test("/admins, /unadmin, /invite, /status", async () => {
  const {administrator, gateway, registry, unknown, lastReply, become} = setup()
  await become()
  await administrator.handle(directMessage("/admins"))
  assert.match(lastReply(), /^ADMINS\n\nalice · since \d{2}\.\d{2}\.\d{4}\n\nRemove: \/unadmin <name>$/)
  await administrator.handle(directMessage("/invite"))
  assert.match(lastReply(), /One-time invitation[\s\S]*https:\/\/simplex\.chat\/invitation#1/)
  assert.equal(gateway.invitations, 1)
  await administrator.handle(directMessage("/status"))
  assert.equal(lastReply(), "STATUS\n\nspinoza 1.1.0 (abc) · up 1h 30m\nGroups: filedrop\nArchive: 2 files · 8 B of 1.0 KiB\nDeleted folder empty\nNo classes yet\nNo schedule\n\nStorage: /space", "no zeros, nothing about admins")
  unknown.record("/лист")
  unknown.record("/лист")
  unknown.record("/файл")
  await administrator.handle(directMessage("/status"))
  assert.match(lastReply(), /\nUnknown commands: \/лист ×2, \/файл ×1\n\nStorage: \/space$/)
  await administrator.handle(directMessage("/unadmin nobody"))
  assert.match(lastReply(), /^There is no admin "nobody"\.\n\nList: \/admins$/)
  await administrator.handle(directMessage("/unadmin Alice"))
  assert.match(lastReply(), /alice is no longer an admin/)
  assert.equal(registry.has(3), false)
})

test("/join connects via a group link and warns when the group does not match the pattern", async () => {
  const {administrator, gateway, lastReply, become} = setup()
  await become()
  await administrator.handle(directMessage("/join"))
  assert.match(lastReply(), /Which group/)
  await administrator.handle(directMessage("/join https://smp.example/g#abc"))
  assert.deepEqual(gateway.connected, ["https://smp.example/g#abc"])
  assert.match(lastReply(), /Connecting to the group "linked"[\s\S]*does not match the configured group pattern "filedrop"/)
  await administrator.handle(directMessage("/join https://smp.example/g#known"))
  assert.equal(lastReply(), 'I am already a member of the group "linked".')
  await administrator.handle(directMessage("/join https://smp.example/a#contact"))
  assert.match(lastReply(), /not a group link/)
  await administrator.handle(bobMessage("/join https://smp.example/g#abc"))
  assert.match(lastReply(), /admins only/)
})

test("group owners count as admins when roles are configured; only admins may add the bot to groups", async () => {
  const members = {1: [{contactId: 4, name: "bob", status: "connected", role: "owner"}, {contactId: 3, name: "alice", status: "connected", role: "member"}]}
  const {admins, registry} = setup({groupRoles: ["owner", "admin"], members})
  assert.equal(await admins.isAdmin(BOB), true)
  assert.equal(await admins.mayInvite(BOB), true)
  assert.equal(await admins.isAdmin({contactId: 3, name: "alice"}), false)
  assert.equal(await admins.mayInvite({contactId: 3, name: "alice"}), false)
  assert.equal(await admins.isAdmin({contactId: null, name: "?"}), false)
  const open = setup({secret: ""}).admins
  assert.equal(await open.mayInvite(BOB), false, "no secret never means open invitations")
  registry.add({contactId: 9, name: "carol"})
  assert.equal(await admins.mayInvite({contactId: 9, name: "carol"}), true)
})
