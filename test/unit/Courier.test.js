import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {Archivist} from "../../src/bot/Archivist.js"
import {Courier} from "../../src/bot/Courier.js"
import {PrivateLine} from "../../src/bot/PrivateLine.js"
import {ContactBook} from "../../src/bot/ContactBook.js"
import {WatchedGroups} from "../../src/bot/WatchedGroups.js"
import {TriggerWord} from "../../src/bot/TriggerWord.js"
import {StorageQuota} from "../../src/bot/StorageQuota.js"
import {RateLimiter} from "../../src/bot/RateLimiter.js"
import {FolderFileStore} from "../../src/storage/FolderFileStore.js"
import {Outbox} from "../../src/storage/Outbox.js"
import {silentLogger} from "../../src/util/logger.js"
import {createReplies} from "../../src/bot/replies.js"
import {FakeGateway, GROUP, DIRECT_ALICE, groupMessage, offer} from "./helpers.js"

const replies = createReplies("en")
const STRANGER = {contactId: null, name: "dave", memberId: 9} // a member without a private chat with the bot
const KEPT = offer({id: 7, name: "reading.pdf", status: "rcvComplete", path: "reading.pdf"})
const tick = () => new Promise((r) => setImmediate(r))

function courier({directMessages = true, limit = 10, recent = []} = {}) {
  const gateway = new FakeGateway({groups: [GROUP], recent})
  if (!directMessages) gateway.memberContactError = "create member contact: commandError (direct messages not allowed)"
  gateway.contacts = [{contactId: 3, name: "alice", status: "active", connStatus: "ready"}]
  gateway.items["1:30"] = groupMessage({itemId: 30, file: KEPT})
  const store = new FolderFileStore(fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-courier-")))
  fs.writeFileSync(path.join(store.dir, "reading.pdf"), "x")
  const groups = new WatchedGroups(gateway, "filedrop")
  const archivist = new Archivist({gateway, groups, quota: new StorageQuota(store, 10 * 1024), store, logger: silentLogger, rule: new TriggerWord("conatus")})
  const contacts = new ContactBook({gateway, logger: silentLogger})
  const line = new PrivateLine({gateway, contacts, logger: silentLogger})
  const c = new Courier({gateway, archivist, store, line, replies, logger: silentLogger, limiter: new RateLimiter({limit, windowMs: 600_000})})
  return {gateway, archivist, store, courier: c}
}

test("conatus as a reply to a kept file: the file is posted again in the group as a reply, captioned that it is in the private chat too, and sent there", async () => {
  const {gateway, store, courier: c} = courier()
  assert.equal(await c.handle(groupMessage({itemId: 31, text: "conatus", quotedItemId: 30})), true)
  assert.deepEqual(gateway.sent, [
    {chat: GROUP, filePath: store.pathOf("reading.pdf"), caption: "alice, the file is also in your private chat with me.", quotedItemId: 31},
    {chat: DIRECT_ALICE, filePath: store.pathOf("reading.pdf")},
  ])
})

test("the same file is re-posted in a group at most once per window; the private copy goes every time", async () => {
  const {gateway, archivist, store} = courier()
  let now = 0
  const c = new Courier({gateway, archivist, store, line: null, replies, logger: silentLogger, clock: () => now, groupCopyWindowMs: 600_000})
  await c.handle(groupMessage({itemId: 31, text: "conatus", quotedItemId: 30}))
  now += 60_000
  await c.handle(groupMessage({itemId: 32, text: "conatus", quotedItemId: 30}))
  assert.deepEqual(gateway.sent.map((m) => m.chat.type), ["group", "direct", "direct"], "the copy from a minute ago is right above")
  now += 600_000
  await c.handle(groupMessage({itemId: 33, text: "conatus", quotedItemId: 30}))
  assert.deepEqual(gateway.sent.slice(3).map((m) => [m.chat.type, m.quotedItemId]), [["group", 33], ["direct", undefined]])
})

test("sentences, other words and files are not requests", async () => {
  const {gateway, courier: c} = courier()
  assert.equal(await c.handle(groupMessage({text: "conatus у Спинозы - это стремление"})), false)
  assert.equal(await c.handle(groupMessage({text: "what is conatus here?", quotedItemId: 30})), false)
  assert.equal(await c.handle(groupMessage({text: "thanks"})), false)
  assert.equal(await c.handle(groupMessage({text: "conatus", file: offer()})), false)
  assert.deepEqual(gateway.sent, [])
})

test("a file still downloading is sent once it arrives; a failed download is reported privately", async () => {
  const {gateway, archivist, store, courier: c} = courier({recent: [groupMessage({itemId: 40, file: offer({id: 8, name: "fresh.pdf"})}), groupMessage({itemId: 41, file: offer({id: 9, name: "broken.pdf"})})]})
  await archivist.handle(groupMessage({itemId: 40, file: offer({id: 8, name: "fresh.pdf"})}))
  await archivist.handle(groupMessage({itemId: 41, file: offer({id: 9, name: "broken.pdf"})}))
  await c.handle(groupMessage({itemId: 42, text: "conatus fresh.pdf"}))
  await c.handle(groupMessage({itemId: 43, text: "Conatus!"})) // the latest file above: broken.pdf
  assert.deepEqual(gateway.sent, [], "nothing until the downloads end")
  fs.writeFileSync(path.join(store.dir, "fresh.pdf"), "x")
  await c.onFileReceived(archivist.onFileReceived(offer({id: 8, name: "fresh.pdf", path: "fresh.pdf"})))
  archivist.onFileFailed(offer({id: 9, name: "broken.pdf"}), "gone")
  await c.onFileFailed(offer({id: 9, name: "broken.pdf"}))
  assert.deepEqual(gateway.sent, [
    {chat: GROUP, filePath: store.pathOf("fresh.pdf"), caption: "alice, the file is also in your private chat with me.", quotedItemId: 42},
    {chat: DIRECT_ALICE, filePath: store.pathOf("fresh.pdf")},
    {chat: DIRECT_ALICE, text: "broken.pdf is no longer kept. The saved files: /files"},
  ], "a failed download posts nothing in the group")
})

test("a file not in the archive any more, and a request with no file near it, are answered privately", async () => {
  const {gateway, courier: c} = courier()
  gateway.items["1:32"] = groupMessage({itemId: 32, file: offer({id: 5, name: "old.pdf", status: "rcvComplete", path: "old.pdf"})})
  gateway.items["1:33"] = groupMessage({itemId: 33, text: "just text"})
  await c.handle(groupMessage({text: "conatus", quotedItemId: 32}))
  await c.handle(groupMessage({text: "conatus", quotedItemId: 33}))
  assert.deepEqual(gateway.sent, [
    {chat: DIRECT_ALICE, text: "old.pdf is no longer kept. The saved files: /files"},
    {chat: DIRECT_ALICE, text: "Which file? Write conatus as a reply to the file, or right after it was posted."},
  ])
})

test("a member without a private chat: the bot opens one naming the file, and sends it once the member accepts", async () => {
  const {gateway, store, courier: c} = courier()
  await c.handle(groupMessage({sender: STRANGER, text: "conatus", quotedItemId: 30}))
  assert.deepEqual(gateway.invitationsSent, [{contactId: 100, text: "You asked for reading.pdf - it comes here as soon as you accept this chat."}])
  assert.deepEqual(gateway.sent, [{chat: GROUP, filePath: store.pathOf("reading.pdf"), caption: "dave, the file is also in your private chat with me.", quotedItemId: 10}], "the group copy at once")
  await c.onContactConnected({contactId: 100, name: "dave"})
  assert.deepEqual(gateway.sent.slice(1), [{chat: {type: "direct", id: 100, name: "dave"}, filePath: store.pathOf("reading.pdf")}])
  await c.onContactConnected({contactId: 100, name: "dave"})
  assert.equal(gateway.sent.length, 2, "sent once")
})

test("a chat not accepted yet keeps the file waiting; a forgotten contact drops it", async () => {
  const {gateway, courier: c} = courier()
  gateway.contacts = [{contactId: 3, name: "alice", status: "active", connStatus: "joined"}]
  gateway.sendFile = async () => {
    throw new Error("contact not ready")
  }
  await c.handle(groupMessage({text: "conatus", quotedItemId: 30}))
  assert.deepEqual(c.awaitingContact.get(3).length, 1)
  c.forget(3)
  assert.equal(c.awaitingContact.has(3), false)
})

test("when the group forbids direct messages the group gets the file and a one-time link for the private chat", async () => {
  const {gateway, courier: c} = courier({directMessages: false})
  await c.handle(groupMessage({itemId: 31, sender: STRANGER, text: "conatus", quotedItemId: 30}))
  assert.equal(gateway.sent.length, 2)
  assert.deepEqual(gateway.sent.map((m) => [m.chat, m.quotedItemId]), [[GROUP, 31], [GROUP, 31]])
  assert.equal(gateway.sent[0].caption, "dave, the file is also in your private chat with me.")
  assert.match(gateway.sent[1].text, /^One-time link for a private chat:\n/)
})

test("beyond the limit requests are ignored", async () => {
  const {gateway, courier: c} = courier({limit: 2})
  for (let i = 0; i < 4; i++) await c.handle(groupMessage({text: "conatus", quotedItemId: 30}))
  await tick()
  assert.deepEqual(gateway.sent.map((m) => m.chat.type), ["group", "direct", "direct"], "two requests answered, one group copy")
})

test("with an outbox the CLI gets a copy of the archived file, never the original", async () => {
  const {gateway, store, archivist} = courier()
  const outbox = new Outbox(path.join(path.dirname(store.dir), `${path.basename(store.dir)}-outbox`))
  outbox.ensure()
  const c = new Courier({gateway, archivist, store, outbox, line: null, replies, logger: silentLogger})
  await c.handle(groupMessage({text: "conatus", quotedItemId: 30}))
  assert.equal(gateway.sent.length, 2, "the group copy and the private one")
  for (const {filePath} of gateway.sent) assert.equal(path.dirname(path.dirname(filePath)), outbox.dir)
  for (const {filePath} of gateway.sent) fs.unlinkSync(filePath)
  assert.equal(fs.existsSync(store.pathOf("reading.pdf")), true)
})

test("a failure that is not the chat's leaves a working contact alone", async () => {
  const {gateway, store, courier: c} = courier()
  gateway.deleteContact = async (id) => (gateway.deleted = [...(gateway.deleted ?? []), id])
  fs.unlinkSync(store.pathOf("reading.pdf")) // deleted with /удалить while the request was on its way
  await c.handle(groupMessage({text: "conatus", quotedItemId: 30}))
  assert.deepEqual(gateway.sent, [{chat: DIRECT_ALICE, text: "reading.pdf is no longer kept. The saved files: /files"}])
  fs.writeFileSync(path.join(store.dir, "reading.pdf"), "x")
  gateway.sendFile = async () => {
    throw new Error("disk full")
  }
  await c.handle(groupMessage({text: "conatus", quotedItemId: 30}))
  assert.equal(gateway.deleted, undefined, "the active contact is kept")
  assert.equal(gateway.invitationsSent, undefined, "no new chat is opened")
})

test("a file still downloading for a member who has not accepted the chat waits for the acceptance", async () => {
  const {gateway, archivist, store, courier: c} = courier()
  gateway.contacts = [{contactId: 3, name: "alice", status: "active", connStatus: "joined"}]
  const realSendFile = gateway.sendFile.bind(gateway)
  gateway.sendFile = async () => {
    throw new Error("contact not ready")
  }
  gateway.items["1:40"] = groupMessage({itemId: 40, file: offer({id: 8, name: "fresh.pdf"})})
  await archivist.handle(gateway.items["1:40"])
  await c.handle(groupMessage({text: "conatus", quotedItemId: 40}))
  fs.writeFileSync(path.join(store.dir, "fresh.pdf"), "x")
  await c.onFileReceived(archivist.onFileReceived(offer({id: 8, name: "fresh.pdf", path: "fresh.pdf", status: "rcvComplete"})))
  assert.equal(c.awaitingContact.get(3).length, 1, "the send failed: it waits for the chat")
  gateway.sendFile = realSendFile
  await c.onContactConnected({contactId: 3, name: "alice"})
  assert.deepEqual(gateway.sent, [{chat: DIRECT_ALICE, filePath: store.pathOf("fresh.pdf")}])
})
