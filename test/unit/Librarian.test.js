import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {Librarian} from "../../src/bot/Librarian.js"
import {FolderFileStore} from "../../src/storage/FolderFileStore.js"
import {GroupMembersOnly, OpenAccess} from "../../src/bot/AccessPolicy.js"
import {WatchedGroups} from "../../src/bot/WatchedGroups.js"
import {silentLogger} from "../../src/util/logger.js"
import {createReplies} from "../../src/bot/replies.js"
import {Listings} from "../../src/bot/Listings.js"
import {UnknownCommands} from "../../src/bot/UnknownCommands.js"
import {Citations} from "../../src/ethics/Citations.js"

const replies = createReplies("en")
import {FakeGateway, GROUP, directMessage} from "./helpers.js"

const noAdmins = {isAdmin: async () => false}
const allAdmins = {isAdmin: async () => true}

function setup({access, files = ["report.pdf", "notes.txt", "a.bin", "b.bin", "c.bin", "d.bin"], gatewayOptions = {}} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-lib-"))
  for (const f of files) fs.writeFileSync(path.join(dir, f), "data")
  const gateway = new FakeGateway({groups: [GROUP], ...gatewayOptions})
  const store = new FolderFileStore(dir)
  const unknown = new UnknownCommands()
  const citations = new Citations([{latin: "Deus sive Natura.", translation_ru: "Бог, или Природа.", source: "Ethica, IV, Praefatio", ref: "Э4пред"}])
  const librarian = new Librarian({gateway, store, replies, logger: silentLogger, access: access ?? new OpenAccess(), admins: noAdmins, listings: new Listings(), unknown, citations})
  return {gateway, librarian, dir, unknown}
}

test("/list replies with the stored files, newest first, with dates", async () => {
  const {gateway, librarian, dir} = setup()
  const day = 86_400_000
  fs.utimesSync(path.join(dir, "notes.txt"), new Date(Date.now() - 3 * day), new Date(Date.now() - 3 * day))
  fs.utimesSync(path.join(dir, "report.pdf"), new Date(Date.now() - 1 * day), new Date(Date.now() - 1 * day))
  fs.utimesSync(path.join(dir, "a.bin"), new Date(Date.now() - 2 * day), new Date(Date.now() - 2 * day))
  await librarian.handle(directMessage("/list *.pdf"))
  assert.equal(gateway.sent.length, 1)
  assert.match(gateway.sent[0].text, /^FILES · 1 · pattern \*\.pdf · newest first\n\n1\. report\.pdf · 4 B · \d{2}\.\d{2}\.\d{4}\n\nReceive: \/get <number>\nFilter: \/files <pattern>\nHelp: \/files \?$/)
  assert.doesNotMatch(gateway.sent[0].text, /notes/)
  await librarian.handle(directMessage("/list"))
  assert.equal(gateway.sent[1].text.split("\n")[0], "FILES · 6 · newest first")
  const lines = gateway.sent[1].text.split("\n").slice(2, 8)
  assert.deepEqual(lines.map((l) => l.split(" ")[0]), ["1.", "2.", "3.", "4.", "5.", "6."])
  const order = lines.map((l) => l.split(" ")[1])
  assert.deepEqual(order.slice(-3), ["report.pdf", "a.bin", "notes.txt"], `order: ${order}`)
})

test("/get <number> picks a file from the last listing shown in this chat", async () => {
  const {gateway, librarian, dir} = setup({files: ["old.pdf", "new.pdf", "3"]})
  const day = 86_400_000
  fs.utimesSync(path.join(dir, "old.pdf"), new Date(Date.now() - 2 * day), new Date(Date.now() - 2 * day))
  fs.utimesSync(path.join(dir, "3"), new Date(Date.now() - 3 * day), new Date(Date.now() - 3 * day))
  await librarian.handle(directMessage("/get 1")) // no listing yet: current order, newest first
  assert.deepEqual(gateway.sent.map((m) => m.filePath), [path.join(dir, "new.pdf")])

  gateway.sent = []
  await librarian.handle(directMessage("/list *.pdf"))
  assert.match(gateway.sent[0].text, /1\. new\.pdf.*\n2\. old\.pdf/)
  await librarian.handle(directMessage("/get 2"))
  assert.equal(gateway.sent[1].filePath, path.join(dir, "old.pdf"))
  await librarian.handle(directMessage("/get 3")) // a file named "3" wins over the number
  assert.equal(gateway.sent[2].filePath, path.join(dir, "3"))
  await librarian.handle(directMessage("/get 7"))
  assert.equal(gateway.sent[3].text, "There is no number 7 in the list - it has 2.\n\nList: /files")
  await librarian.handle(directMessage("/get 0"))
  assert.match(gateway.sent[4].text, /no number 0 in the list/)
  // another chat has its own listing
  const bob = {sender: {contactId: 4, name: "bob"}, chat: {type: "direct", id: 4, name: "bob"}}
  await librarian.handle(directMessage("/get 2", bob))
  assert.equal(gateway.sent[5].filePath, path.join(dir, "old.pdf"), "newest first over all files: new.pdf, old.pdf, 3")
})

test("an empty filter does not steal the numbers; the /файлы section words reach the same handlers", async () => {
  const {gateway, librarian, dir} = setup({files: ["a.pdf", "b.pdf"]})
  await librarian.handle(directMessage("/файлы"))
  assert.match(gateway.sent[0].text, /^FILES · 2 · newest first\n/)
  await librarian.handle(directMessage("/файлы *.zip"))
  assert.equal(gateway.sent[1].text, 'No saved files match "*.zip".\n\nList: /files')
  await librarian.handle(directMessage("/ф д 2"))
  assert.ok(gateway.sent[2].filePath.endsWith(".pdf"), `number 2 still means the second file of the last non-empty list: ${gateway.sent[2].text}`)
  await librarian.handle(directMessage("/файлы ?"))
  assert.match(gateway.sent[3].text, /^FILES\n\n\/files \[pattern\]\n[\s\S]*Also: \/files space, \/ф м\n\nNumbers refer to the list shown last\.$/)
  await librarian.handle(directMessage("/files ?", {sender: {contactId: 9, name: "carol"}, chat: {type: "direct", id: 9, name: "carol"}}))
  assert.match(gateway.sent[4].text, /^FILES\n/, "OpenAccess: everyone is a member here")
  const {gateway: g2, librarian: fresh} = setup({files: ["only.pdf"]})
  await fresh.handle(directMessage("/get 3"))
  assert.equal(g2.sent[0].text, "There is no number 3 in the list - it has 1.\n\nList: /files")
  void dir
})

test("/get ignores files in subfolders and never resolves a path", async () => {
  const {gateway, librarian, dir} = setup({files: ["loose.pdf"]})
  fs.mkdirSync(path.join(dir, "2026-09-22"))
  fs.writeFileSync(path.join(dir, "2026-09-22", "reading.pdf"), "data")
  await librarian.handle(directMessage("/get reading.pdf"))
  await librarian.handle(directMessage("/get 2026-09-22/reading.pdf"))
  assert.deepEqual(gateway.sent.map((m) => m.filePath), [undefined, undefined], "the archive is flat: a subfolder is not part of it")
  assert.match(gateway.sent[0].text, /^There is no file "reading\.pdf"/)
  await librarian.handle(directMessage("/list"))
  assert.match(gateway.sent[2].text, /\n1\. loose\.pdf · /)
  assert.doesNotMatch(gateway.sent[2].text, /reading\.pdf/)
})

test("/list flags empty files and shortens very long names, keeping the extension", async () => {
  const long = "Access to Arasaka - l a k e s - 01 EL54.flac"
  const {gateway, librarian, dir} = setup({files: [long, "empty.pdf"]})
  fs.writeFileSync(path.join(dir, "empty.pdf"), "")
  await librarian.handle(directMessage("/list"))
  const lines = gateway.sent[0].text.split("\n")
  assert.match(lines[2], /^1\. (Access to Arasaka - l a k e s - 01 EL54…flac · 4 B · \d{2}\.\d{2}\.\d{4}|empty\.pdf · 0 B · empty or not fully downloaded)$/)
  assert.ok(lines.slice(2, 4).some((l) => l.endsWith("empty.pdf · 0 B · empty or not fully downloaded")), lines.join("|"))
  await librarian.handle(directMessage(`/get ${long}`))
  assert.equal(gateway.sent[1].filePath, path.join(dir, long), "the full name still works")
})

test("/get sends the matching file, reports unknown names, limits bulk requests", async () => {
  const {gateway, librarian, dir} = setup()
  await librarian.handle(directMessage("/get REPORT.pdf"))
  assert.deepEqual(gateway.sent, [{chat: directMessage("").chat, filePath: path.join(dir, "report.pdf")}])

  gateway.sent = []
  await librarian.handle(directMessage("get nope.zip"))
  assert.match(gateway.sent[0].text, /^There is no file "nope\.zip"\.\n\nList: \/files$/)

  gateway.sent = []
  await librarian.handle(directMessage("/get *.bin"))
  assert.match(gateway.sent[0].text, /^FOUND · 4 · \*\.bin\n\n1\. \w\.bin\n2\. \w\.bin\n3\. \w\.bin\n4\. \w\.bin\n\nReceive: \/get <number>\nNarrow down: \/get <name>$/)
  const second = gateway.sent[0].text.split("\n")[3].slice(3)
  await librarian.handle(directMessage("/get 2"))
  assert.equal(gateway.sent[1].filePath, path.join(dir, second), "the numbers of the choice work right away")

  gateway.sent = []
  await librarian.handle(directMessage("/get"))
  assert.equal(gateway.sent[0].text, "Give the file's number or name.\n\nExample: /get 3\nList: /files")
})

/** every help starts with a quotation and its identifier: the rest is the help itself */
const afterQuote = (text) => {
  const lines = text.split("\n")
  assert.match(lines[1], /^\[Э[^\]]+\]$/, `quotation expected first: ${text.slice(0, 80)}`)
  assert.equal(lines[2], "")
  return lines.slice(3).join("\n")
}

test("help for /help and anything unknown; ignores group and own messages", async () => {
  const {gateway, librarian} = setup()
  await librarian.handle(directMessage("/help"))
  await librarian.handle(directMessage("what can you do?"))
  assert.equal(gateway.sent.length, 2)
  assert.equal(gateway.sent[0].text.split("\n")[0], "Deus sive Natura.", "a quotation opens the help")
  assert.match(gateway.sent[1].text, /\/files/)
  assert.doesNotMatch(gateway.sent[1].text, /Admin/)

  librarian.admins = allAdmins
  await librarian.handle(directMessage("/help"))
  assert.doesNotMatch(gateway.sent[2].text, /Admin|\/delete/, "the short help is the same for admins")
  await librarian.handle(directMessage("/help all"))
  assert.match(gateway.sent[3].text, /\/delete <number\|name>[\s\S]*\nOTHER\n\/status - the bot's state\n[\s\S]*\nADMIN\n\/admins - the admins/)
  assert.doesNotMatch(gateway.sent[3].text, /\/invite|\/join|\/'/) // deliberately hidden - see Command.js; no quoted commands

  gateway.sent = []
  await librarian.handle(directMessage("/list", {chat: GROUP}))
  await librarian.handle(directMessage("/list", {incoming: false}))
  assert.deepEqual(gateway.sent, [])
})

test("members-only access denies strangers and admits members", async () => {
  const gatewayOptions = {members: {1: [{contactId: 3, name: "alice", status: "connected"}, {contactId: 5, name: "eve", status: "left"}]}}
  const {gateway, librarian} = setup({gatewayOptions, access: null})
  librarian.access = new GroupMembersOnly(gateway, new WatchedGroups(gateway, "filedrop"))

  await librarian.handle(directMessage("/list"))
  assert.match(gateway.sent[0].text, /^FILES · /)

  gateway.sent = []
  await librarian.handle(directMessage("/list", {sender: {contactId: 9, name: "carol"}, chat: {type: "direct", id: 9, name: "carol"}}))
  await librarian.handle(directMessage("/list", {sender: {contactId: 5, name: "eve"}, chat: {type: "direct", id: 5, name: "eve"}}))
  assert.equal(gateway.sent.length, 2)
  assert.match(gateway.sent[0].text, /only members/)
  assert.match(gateway.sent[1].text, /only members/)

  gateway.sent = []
  await librarian.handle(directMessage("/help", {sender: {contactId: 9, name: "carol"}, chat: {type: "direct", id: 9, name: "carol"}}))
  assert.match(afterQuote(gateway.sent[0].text), /^Files and classes are for members/)
  assert.match(gateway.sent[0].text, /\/ethics/)
  assert.doesNotMatch(gateway.sent[0].text, /\/files|\/дз|Admin|In the group/)
})

test("short help lists the main commands; /help all every command by section; admins additionally the admin section (never /invite or /join)", async () => {
  const {gateway, librarian} = setup()
  await librarian.handle(directMessage("/help"))
  const short = afterQuote(gateway.sent[0].text)
  assert.equal(
    short,
    [
      "I keep the group's files, organise the classes and help with Spinoza's Ethics.",
      "",
      "/files - the saved files",
      "/class - the next class, the schedule, moves",
      "/vote - polls",
      "/ethics - Spinoza's Ethics",
      "/watch - notifications about classes",
      "",
      "Commands shorten to one letter: /f, /c, /v, /e, /w.",
      "Every command: /??",
    ].join("\n")
  )
  assert.doesNotMatch(short, /\/delete|\/move|admin|\/'/i)
  await librarian.handle(directMessage("/help all"))
  const full = afterQuote(gateway.sent[1].text)
  assert.equal(
    full,
    [
      "FILES",
      "/files [pattern] - show the files",
      "/get <number|name> - receive a file",
      "/delete <number|name> - move to the deleted folder",
      "/deleted - show the deleted files",
      "/restore <number|name> - bring a file back",
      "/space - storage usage",
      "/files ? - details",
      "",
      "CLASSES",
      "/class [date] - one class and its materials",
      "/class list [month|year|archive] - the lists and the archive of classes",
      "/class schedule [weekday] [time] - show or change the schedule",
      "/class move <date> [time] - move one class",
      "/class cancel [date] - cancel one class",
      "/watch [on|off] - notifications about changes",
      "/class ? - details",
      "",
      "POLLS",
      "/vote - active polls",
      "/vote <question> | <option 1> | <option 2> - create one",
      "/vote <number> - state and results",
      "/vote close <number> - end a poll",
      "/vote cancel <number> - cancel",
      "/vote history - closed polls",
      "/vote ? - details",
      "",
      "ETHICS",
      "/ethics - the memo",
      "/ethics [full|all] <ID> - a passage: E1p7, часть 1 теорема 7",
      "/ethics search <text> - find",
      "/ethics list <part> - the structure of a part",
      "/ethics random - a random theorem",
      "/ethics ? - identifiers and modes",
      "",
      "IN THE GROUP",
      "every file in the group is kept in the archive", "conatus - as a reply to a file or right after it: I post the file in the group and send it to you privately",
      "prius [date] - tie a file to the last class, or to the class on that date (used like conatus)",
      "/spinoza class [date] [topic] - tie a post to a class: as the first line of the post, a reply or a comment",
      "/spinoza schedule - show the schedule; /spinoza - the help into the private chat",
      "",
      "OTHER",
      "/status - the bot's state",
      "/confirm, /drop - accept or discard a previewed change",
      "",
      "SHORT FORMS",
      "One letter for the section, the English word for the operation:",
      "/f = /files",
      "/f delete 2 = /files delete 2",
      "/c 19.09 = /class 19.09",
      "/c move 20:00 = /class move 20:00",
      "/v close 1 = /vote close 1",
      "/e full E1p7 = /ethics full E1p7",
      "/w on = /watch on",
      "The Russian forms /ф /з /г /э /у and /д /п /о work too",
      "",
      "HELP",
      "/? - the main commands",
      "/?? - every command (this help)",
      "/<section> ? - a section's help: /f ?, /c ?, /v ?, /e ?",
    ].join("\n")
  )
  await librarian.handle(directMessage("/?"))
  assert.equal(afterQuote(gateway.sent[2].text), short, "/? is the short help")
  await librarian.handle(directMessage("? все"))
  assert.equal(afterQuote(gateway.sent[3].text), full, "? все - the full one, slash optional")
  await librarian.handle(directMessage("/??"))
  assert.equal(afterQuote(gateway.sent[4].text), full, "/?? is the full help")
  librarian.admins = allAdmins
  await librarian.handle(directMessage("/help всё"))
  const admin = afterQuote(gateway.sent[5].text)
  assert.match(admin, /\nOTHER\n\/status - the bot's state\n\/confirm, \/drop - accept or discard a previewed change\n\nSHORT FORMS\n[\s\S]*\n\nADMIN\n\/admins - the admins\n\/unadmin <name> - remove an admin$/)
  assert.doesNotMatch(admin, /\/join|\/invite|\(\/|\/'/) // hidden admin commands, no English aliases, no quotes
})

test("a mistyped slash command gets a corrective hint instead of the help, and is counted for /status", async () => {
  const {gateway, librarian, unknown} = setup()
  await librarian.handle(directMessage("/gett report.pdf"))
  assert.equal(gateway.sent[0].text, 'I do not know the command "/gett".\n\nPerhaps you meant:\n/дай <номер|имя>\n\nHelp: /?\nAll commands: /??')
  await librarian.handle(directMessage("/xyzzy"))
  assert.equal(gateway.sent[1].text, 'I do not know the command "/xyzzy".\n\nHelp: /?\nAll commands: /??')
  await librarian.handle(directMessage("/x"))
  assert.equal(gateway.sent[2].text, 'I do not know the command "/x".\n\nHelp: /?\nAll commands: /??', "one-letter aliases never pose as the nearest command")
  await librarian.handle(directMessage("/gett again"))
  assert.deepEqual(unknown.top(), [{word: "/gett", count: 2}, {word: "/x", count: 1}, {word: "/xyzzy", count: 1}])
  await librarian.handle(directMessage("just chatting"))
  assert.match(gateway.sent[4].text, /\n\nI keep the group's files/, "plain text still gets the short help, after a quotation")
  await librarian.handle(directMessage("/д 1"))
  assert.ok(gateway.sent[5].filePath, "/д is /get")
})

test("/spinoza in the private chat gives the same personal help as from the group; a stranger gets the limited help", async () => {
  const {gateway, librarian} = setup()
  await librarian.handle(directMessage("/spinoza"))
  assert.match(gateway.sent[0].text, /^Deus sive Natura\.\n\[Э4пред\]\n\nI keep the group's files[\s\S]*\nIn this private chat:\n\/files - [\s\S]*\nIn the group:\n[\s\S]*\/spinoza class \[date\] \[topic\] - tie a post to a class\n\/spinoza - this help into the private chat$/)
  librarian.access = {allows: async () => false, describe: () => ""}
  await librarian.handle(directMessage("/spinoza"))
  assert.match(gateway.sent[1].text, /\n\nFiles and classes are for members/)
})
