import test from "node:test"
import assert from "node:assert/strict"
import {GroupDesk} from "../../src/bot/GroupDesk.js"
import {WatchedGroups} from "../../src/bot/WatchedGroups.js"
import {RateLimiter} from "../../src/bot/RateLimiter.js"
import {Citations} from "../../src/ethics/Citations.js"
import {ContactBook} from "../../src/bot/ContactBook.js"
import {silentLogger} from "../../src/util/logger.js"
import {createReplies} from "../../src/bot/replies.js"
import {FakeGateway, GROUP, OTHER_GROUP, groupMessage, directMessage} from "./helpers.js"

const replies = createReplies("en")
const citations = () =>
  new Citations([
    {latin: "Deus sive Natura.", translation_ru: "Бог, или Природа.", source: "Ethica, IV, Praefatio", ref: "Э4пред"},
    {latin: "Ad naturam substantiae pertinet existere.", translation_ru: "Природе субстанции присуще существование.", source: "Ethica, I, Propositio 7", ref: "Э1т7"},
  ])
const STRANGER = {contactId: null, name: "dave", memberId: 9} // a member without a private chat with the bot

function desk({admin = false, directMessages = false} = {}) {
  const gateway = new FakeGateway({groups: [GROUP, OTHER_GROUP]})
  if (!directMessages) gateway.memberContactError = "create member contact: commandError (direct messages not allowed)"
  gateway.contacts = [{contactId: 3, name: "alice", status: "active", connStatus: "ready"}]
  let now = 0
  const limiter = new RateLimiter({limit: 3, windowMs: 10 * 60_000, clock: () => now})
  const contacts = new ContactBook({gateway, logger: silentLogger})
  const d = new GroupDesk({gateway, groups: new WatchedGroups(gateway, "filedrop"), citations: citations(), contacts, admins: {isAdmin: async () => admin}, replies, logger: silentLogger, limiter, clock: () => now, linkTtlMs: 60 * 60_000})
  return {gateway, desk: d, advance: (ms) => (now += ms)}
}

test("/spinoza from a member with a private chat: the personal help goes there, the group gets one line answering the message", async () => {
  const {gateway, desk: d} = desk()
  await d.handle(groupMessage({itemId: 41, text: "/spinoza"}))
  assert.equal(gateway.sent.length, 2)
  const [privately, inGroup] = gateway.sent
  assert.deepEqual(privately.chat, {type: "direct", id: 3, name: "alice"})
  const lines = privately.text.split("\n")
  assert.ok(citations().list().some((c) => c.latin === lines[0]), `a quotation first: ${lines[0]}`)
  assert.match(lines[1], /^\[Э[^\]]+\]$/)
  assert.deepEqual(lines.slice(2), ["", "I keep the group's files, organise the classes and help with Spinoza's Ethics.", "", "In this private chat:", "/files - the saved files", "/class - the next class, the schedule, moves", "/vote - polls", "/ethics - Spinoza's Ethics", "/watch - notifications about classes", "/? - the main commands, /?? - every command", "Commands shorten to one letter: /f, /c, /v, /e, /w.", "", "In the group:", "every file in the group is kept in the archive", "conatus - as a reply to a file or right after it: I post the file in the group and send it to you privately", "prius [date] - tie a file to the last class, or to the class on that date", "/spinoza schedule - show the schedule", "/spinoza class [date] [topic] - tie a post to a class", "/spinoza - this help into the private chat"])
  assert.deepEqual(inGroup, {chat: GROUP, text: "The help was sent to you privately.", quotedItemId: 41})
  assert.equal(gateway.invitations, 0)
})

test("/spinoza help (or all, ?, помощь) sends the full help privately - with the admin lines for an admin", async () => {
  const {gateway, desk: d} = desk()
  await d.handle(groupMessage({text: "/spinoza help"}))
  assert.match(gateway.sent[0].text, /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\nFILES\n[\s\S]*\nOTHER\n\/status - the bot's state\n\/confirm, \/drop - accept or discard a previewed change\n\nSHORT FORMS\n[\s\S]*The Russian forms \/ф \/з \/г \/э \/у and \/д \/п \/о work too\n\nHELP\n\/\? - the main commands\n\/\?\? - every command \(this help\)\n\/<section> \? - a section's help: \/f \?, \/c \?, \/v \?, \/e \?$/)
  assert.equal(gateway.sent[1].text, "The help was sent to you privately.")
  await d.handle(groupMessage({text: "/spinoza ?"}))
  assert.match(gateway.sent[2].text, /\n\nFILES\n/)
  await d.handle(groupMessage({text: "/spinoza ??"}))
  assert.match(gateway.sent[4].text, /\n\nFILES\n/)
  const {gateway: g2, desk: adminDesk} = desk({admin: true})
  await adminDesk.handle(groupMessage({text: "/spinoza помощь"}))
  assert.match(g2.sent[0].text, /\n\nADMIN\n\/admins - the admins\n\/unadmin <name> - remove an admin$/)
  assert.doesNotMatch(g2.sent[0].text, /\/invite|\/join/) // deliberately hidden - see Command.js
})

test("/spinoza from a member without a private chat: a chat is opened through the group with the help as its first message", async () => {
  const {gateway, desk: d} = desk({directMessages: true})
  await d.handle(groupMessage({itemId: 50, text: "/spinoza", sender: STRANGER}))
  assert.deepEqual(gateway.memberContacts, [{groupId: 1, memberId: 9, contactId: 100}])
  assert.equal(gateway.invitationsSent.length, 1)
  assert.equal(gateway.invitationsSent[0].contactId, 100)
  assert.match(gateway.invitationsSent[0].text, /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\nI keep the group's files[\s\S]*\nIn the group:\n/)
  assert.deepEqual(gateway.sent, [{chat: GROUP, text: "I sent you a request for a private chat - accept it in your chat list, the help arrives there.", quotedItemId: 50}])
  assert.equal(gateway.invitations, 0, "no one-time link needed")
})

test("/spinoza from a member without a private chat when the group forbids direct messages: a one-time link answers the message; the same link while it is fresh", async () => {
  const {gateway, desk: d, advance} = desk()
  await d.handle(groupMessage({itemId: 50, text: "/spinoza", sender: STRANGER}))
  assert.deepEqual(gateway.sent, [{chat: GROUP, text: "One-time link for a private chat:\nhttps://simplex.chat/invitation#1", quotedItemId: 50}])
  await d.handle(groupMessage({itemId: 51, text: "/spinoza help", sender: STRANGER}))
  assert.equal(gateway.invitations, 1, "no new link while the previous one is fresh")
  assert.match(gateway.sent[1].text, /invitation#1$/)
  await d.handle(groupMessage({itemId: 52, text: "/spinoza", sender: STRANGER}))
  await d.handle(groupMessage({itemId: 53, text: "/spinoza", sender: STRANGER}))
  assert.deepEqual(gateway.sent[3], {chat: GROUP, text: "Too many messages - please wait 10 minutes.", quotedItemId: 53}, "the fourth call in ten minutes is told to wait, once")
  await d.handle(groupMessage({itemId: 54, text: "/spinoza", sender: STRANGER}))
  assert.equal(gateway.sent.length, 4, "then silence")
  advance(61 * 60_000)
  await d.handle(groupMessage({itemId: 55, text: "/spinoza", sender: STRANGER}))
  assert.equal(gateway.invitations, 2, "a fresh link after the old one aged")
  assert.match(gateway.sent[4].text, /invitation#2$/)
})

test("a member who deleted the chat with the bot still counts as a contact: the dead contact is removed and a new chat opened; a pending one is only explained", async () => {
  const {gateway, desk: d} = desk({directMessages: true})
  const send = gateway.sendText.bind(gateway)
  gateway.sendText = async (chat, ...rest) => {
    if (chat.type === "direct") throw new Error("send message: contactNotReady")
    return send(chat, ...rest)
  }
  gateway.contacts = [{contactId: 3, name: "alice", status: "deleted", connStatus: "deleted"}]
  await d.handle(groupMessage({itemId: 60, text: "/spinoza"}))
  assert.deepEqual(gateway.deleted, [3], "the dead contact is dropped so the member can be linked again")
  assert.deepEqual(gateway.memberContacts.map((m) => m.memberId), [2])
  assert.deepEqual(gateway.sent, [{chat: GROUP, text: "I sent you a request for a private chat - accept it in your chat list, the help arrives there.", quotedItemId: 60}])
  // the new contact exists but the member's device has not joined yet
  gateway.contacts = [{contactId: 100, name: "alice", status: "active", connStatus: "new"}]
  await d.handle(groupMessage({itemId: 61, text: "/spinoza", sender: {contactId: 100, name: "alice", memberId: 2}}))
  assert.deepEqual(gateway.sent[1], {chat: GROUP, text: "The request for a private chat is already sent - accept it in your chat list.", quotedItemId: 61})
  assert.deepEqual(gateway.deleted, [3], "a pending contact is kept")
})

test("greeting a group: a quotation and one line per thing done in the group", async () => {
  const {gateway, desk: d} = desk()
  await d.greet(GROUP)
  const lines = gateway.sent[0].text.split("\n")
  assert.ok(citations().list().some((c) => c.latin === lines[0]))
  assert.deepEqual(lines.slice(1), [`[${citations().list().find((c) => c.latin === lines[0]).ref}]`, "", "every file in the group is kept in the archive", "conatus - as a reply to a file or right after it: I post the file in the group and send it to you privately", "prius [date] - tie a file to the last class", "", "/spinoza - open a private chat or get the help", "/spinoza schedule - show the schedule", "/spinoza class [date] [topic] - tie a post to a class"])
})

test("other texts, other groups, direct chats, files and own messages are ignored", async () => {
  const {gateway, desk: d} = desk()
  await d.handle(groupMessage({text: "please help"}))
  await d.handle(groupMessage({text: "spinoza"})) // without the slash it is a word, not the command
  await d.handle(groupMessage({text: "Спиноза писал о conatus как о стремлении."}))
  await d.handle(groupMessage({text: "/spinoza", chat: OTHER_GROUP}))
  await d.handle(groupMessage({text: "/spinoza", incoming: false}))
  await d.handle(groupMessage({text: "/spinoza", file: {id: 1, name: "x.pdf", size: 1, status: "rcvInvitation", path: null, contentType: "file"}}))
  await d.handle(directMessage("/spinoza"))
  assert.deepEqual(gateway.sent, [])
  assert.equal(gateway.invitations, 0)
})

test("a private command typed in the group gets one line saying where it works - rate-limited; plain words and the group's own commands do not", async () => {
  const {gateway, desk: d} = desk()
  await d.handle(groupMessage({itemId: 70, text: "/list"}))
  assert.deepEqual(gateway.sent, [{chat: GROUP, text: "This is done in the private chat: write to me or send /spinoza.", quotedItemId: 70}])
  await d.handle(groupMessage({itemId: 71, text: "/этика Э1т7"}))
  await d.handle(groupMessage({itemId: 72, text: "/?"}))
  assert.equal(gateway.sent.length, 3)
  await d.handle(groupMessage({itemId: 73, text: "/status"}))
  assert.equal(gateway.sent.length, 3, "the fourth private command in ten minutes is ignored - the group is not a chat with the bot")
  gateway.sent = []
  const {gateway: g2, desk: d2} = desk()
  await d2.handle(groupMessage({text: "list of things"})) // no slash: plain talk
  await d2.handle(groupMessage({text: "help me please"}))
  await d2.handle(groupMessage({text: "prius"})) // the Curator's business
  await d2.handle(groupMessage({text: "/spinoza class 22.09 Substance"}))
  await d2.handle(groupMessage({text: "/xyzzy"})) // unknown: nobody's
  assert.deepEqual(g2.sent, [])
})

test("a chat created but not invited is removed before the one-time link, so the member is not tied to it", async () => {
  const {gateway, desk: d} = desk({directMessages: true})
  gateway.sendMemberContactInvitation = async () => {
    throw new Error("agent error")
  }
  gateway.deleteContact = async (id) => (gateway.deleted = [...(gateway.deleted ?? []), id])
  await d.handle(groupMessage({itemId: 50, text: "/spinoza", sender: {contactId: null, name: "dave", memberId: 9}}))
  assert.deepEqual(gateway.deleted, [gateway.memberContacts[0].contactId])
  assert.match(gateway.sent.at(-1).text, /^One-time link for a private chat:\n/)
})
