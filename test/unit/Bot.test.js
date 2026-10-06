import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {Bot} from "../../src/bot/Bot.js"
import {WatchedGroups} from "../../src/bot/WatchedGroups.js"
import {silentLogger} from "../../src/util/logger.js"
import {FakeGateway, GROUP, groupMessage, directMessage} from "./helpers.js"

/** Gateway fake with the start-up calls the Bot makes, plus a scripted event stream. */
class StartupGateway extends FakeGateway {
  constructor(opts) {
    super(opts)
    this.eventHandlers = []
    this.openHandlers = []
    this.commands = []
    this.joined = []
  }
  onEvent(fn) {
    this.eventHandlers.push(fn)
  }
  onOpen(fn) {
    this.openHandlers.push(fn)
  }
  async start() {
    for (const fn of this.openHandlers) fn()
  }
  async activeUser() {
    return {userId: 1, name: "spinoza", image: this.image ?? null}
  }
  async setProfileImage(dataUri) {
    this.imagesSet = [...(this.imagesSet ?? []), dataUri]
  }
  async setFilesFolder() {}
  async setBotCommands() {}
  async acceptMemberContacts() {
    this.acceptsMemberContacts = true
  }
  async ensureAddress() {
    return "https://smp.example/a#bot"
  }
  async joinGroup(groupId) {
    this.joined.push(groupId)
  }
  emit(event) {
    for (const fn of this.eventHandlers) fn(event)
  }
}

const settle = () => new Promise((r) => setTimeout(r, 20))

function bot(gateway, {groupLinks = [], mayInvite = async () => true, avatarFile = null, handled = [], throttle = {handle: async () => false, describe: () => ""}} = {}) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-bot-"))
  const groups = new WatchedGroups(gateway, "filedrop")
  const record = (name) => async (m) => (handled.push(`${name}:${m.text}`), false)
  const noop = {handle: record("archivist"), describe: () => "", scan: async () => {}, onFileReceived() {}, onFileFailed() {}, onMessageDeleted: (m) => (handled.push(`archivist-deleted:${m.text}`), null), rule: {word: "conatus", describe: () => ""}}
  const admins = {describe: () => "", mayInvite, registry: {list: () => []}}
  const replies = {botCommandsSpec: ""}
  return new Bot({
    gateway,
    groups,
    admins,
    logger: silentLogger,
    archivist: noop,
    librarian: {...noop, handle: record("librarian"), access: {describe: () => ""}},
    administrator: {handle: record("administrator"), purgeDeleted: () => []},
    throttle,
    curator: {handle: record("curator"), handleUpdate: record("curator-update"), onMessageDeleted: (m) => handled.push(`curator-deleted:${m.text}`), onFileStored: () => {}, describe: () => ""},
    syllabus: {handle: record("syllabus")},
    philosopher: {handle: record("philosopher")},
    greeter: {greet: async (c) => handled.push(`greeter:${c.name}`)},
    contacts: {cleanup: async () => 0, onContactDeleted: async (c) => handled.push(`contacts-deleted:${c.name}`)},
    replies,
    groupDesk: {handle: record("groupDesk"), greet: async (group) => gateway.sendText(group, "hello group")},
    options: {filesDir: "/tmp", stateDir, scanCount: 0, publicAddress: true, groupLinks, avatarFile},
  })
}

test("start-up joins configured group links and writes the address", async () => {
  const gateway = new StartupGateway({groups: [GROUP]})
  const b = bot(gateway, {groupLinks: ["https://smp.example/g#new", "https://smp.example/g#known"]})
  await b.run()
  await settle()
  assert.deepEqual(gateway.connected, ["https://smp.example/g#new", "https://smp.example/g#known"])
  assert.equal(fs.readFileSync(path.join(b.options.stateDir, "address.txt"), "utf8").trim(), "https://smp.example/a#bot")
})

test("joining a watched group posts the group greeting", async () => {
  const gateway = new StartupGateway({groups: []})
  const b = bot(gateway)
  await b.run()
  await settle()
  gateway.emit({kind: "joinedGroup", group: {type: "group", id: 1, name: "filedrop", title: "filedrop"}})
  gateway.emit({kind: "joinedGroup", group: {type: "group", id: 2, name: "other", title: "other"}})
  await settle()
  assert.deepEqual(gateway.sent, [{chat: {type: "group", id: 1, name: "filedrop", title: "filedrop"}, text: "hello group"}])
})

test("the avatar is set once and skipped when already current", async () => {
  const avatarFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-avatar-")), "avatar.png")
  fs.writeFileSync(avatarFile, Buffer.from("png-bytes"))
  const expected = `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`
  const gateway = new StartupGateway({groups: []})
  await bot(gateway, {avatarFile}).run()
  await settle()
  assert.deepEqual(gateway.imagesSet, [expected])
  const current = new StartupGateway({groups: []})
  current.image = expected
  await bot(current, {avatarFile}).run()
  await settle()
  assert.equal(current.imagesSet, undefined)
})

test("replayed group history is archived but its commands are not executed; timestamps play no role", async () => {
  const handled = []
  const gateway = new StartupGateway({groups: [GROUP]})
  await bot(gateway, {handled}).run()
  await settle()
  const old = new Date(Date.now() - 10 * 60_000)
  gateway.emit({kind: "message", message: groupMessage({text: "/whatever replayed", sentAt: old, forwarded: true})})
  gateway.emit({kind: "message", message: groupMessage({text: "/whatever live-but-old-clock", sentAt: old})})
  gateway.emit({kind: "message", message: groupMessage({text: "/whatever live"})})
  gateway.emit({kind: "message", message: directMessage("/list old-clock", {sentAt: old})})
  gateway.emit({kind: "message", message: directMessage("/list live")})
  await settle()
  assert.deepEqual(handled.sort(), [
    "administrator:/list live",
    "administrator:/list old-clock",
    "archivist:/whatever live",
    "archivist:/whatever live-but-old-clock",
    "archivist:/whatever replayed",
    "curator:/whatever live",
    "curator:/whatever live-but-old-clock",
    "groupDesk:/whatever live",
    "groupDesk:/whatever live-but-old-clock",
    "librarian:/list live",
    "librarian:/list old-clock",
    "philosopher:/list live",
    "philosopher:/list old-clock",
    "syllabus:/list live",
    "syllabus:/list old-clock",
  ])
  gateway.emit({kind: "messageUpdated", message: groupMessage({text: "edited"})})
  gateway.emit({kind: "messageDeleted", message: groupMessage({text: "gone"})})
  await settle()
  assert.ok(handled.includes("curator-update:edited"))
  assert.ok(handled.includes("archivist-deleted:gone") && handled.includes("curator-deleted:gone"))
})

test("a throttled contact's private messages go nowhere", async () => {
  const handled = []
  const gateway = new StartupGateway({groups: [GROUP]})
  const throttle = {handle: async (m) => m.text.includes("spam"), describe: () => ""}
  await bot(gateway, {handled, throttle}).run()
  await settle()
  gateway.emit({kind: "message", message: directMessage("/list spam")})
  gateway.emit({kind: "message", message: directMessage("/list ok")})
  await settle()
  assert.deepEqual(handled.filter((h) => h.startsWith("librarian")), ["librarian:/list ok"])
})

test("group invitations are joined only from allowed inviters and for matching groups", async () => {
  const gateway = new StartupGateway({groups: []})
  const b = bot(gateway, {mayInvite: async (c) => c.name === "alice"})
  await b.run()
  await settle()
  const invitation = (id, title, from) => ({kind: "groupInvitation", group: {type: "group", id, name: title, title}, from: {contactId: 1, name: from}})
  gateway.emit(invitation(1, "filedrop", "alice"))
  gateway.emit(invitation(2, "filedrop", "carol"))
  gateway.emit(invitation(3, "other", "alice"))
  await settle()
  assert.deepEqual(gateway.joined, [1])
})

test("a failed greeting does not hold back what the new contact asked for", async () => {
  const gateway = new StartupGateway({groups: [GROUP]})
  const b = bot(gateway)
  const delivered = []
  b.greeter = {greet: async () => {
    throw new Error("cannot send")
  }}
  b.courier = {onContactConnected: async (c) => delivered.push(c.name)}
  await b.run()
  await new Promise((r) => setTimeout(r, 20))
  gateway.emit({kind: "contactConnected", contact: {contactId: 7, name: "dave"}})
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(delivered, ["dave"])
})
