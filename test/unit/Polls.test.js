import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {PollBoard} from "../../src/bot/PollBoard.js"
import {PollDesk} from "../../src/bot/PollDesk.js"
import {Confirmations} from "../../src/bot/Confirmations.js"
import {ConfirmDesk} from "../../src/bot/ConfirmDesk.js"
import {PollStore} from "../../src/storage/PollStore.js"
import {WatchedGroups} from "../../src/bot/WatchedGroups.js"
import {OpenAccess} from "../../src/bot/AccessPolicy.js"
import {createReplies} from "../../src/bot/replies.js"
import {silentLogger} from "../../src/util/logger.js"
import {FakeGateway, GROUP, OTHER_GROUP, directMessage} from "./helpers.js"

const replies = createReplies("en")
const BOB = {contactId: 4, name: "bob", memberId: 5}
const CAROL = {contactId: 9, name: "carol", memberId: 7}
const bobChat = {type: "direct", id: 4, name: "bob"}
const tick = () => new Promise((r) => setImmediate(r))

function setup({groups = [GROUP], pattern = "filedrop", admin = false, start = "2026-09-09T12:00:00Z"} = {}) {
  let now = Date.parse(start)
  const gateway = new FakeGateway({groups})
  const polls = new PollStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-polls-")), "polls.json"))
  const timers = []
  const board = new PollBoard({
    gateway, polls, replies, logger: silentLogger, timezone: "UTC", editDelayMs: 1000,
    clock: () => new Date(now), setTimer: (fn, ms) => (timers.push({fn, ms}), timers.length), clearTimer: (id) => (timers[id - 1] = null),
  })
  const confirmations = new Confirmations({clock: () => now})
  const desk = new PollDesk({gateway, polls, board, groups: new WatchedGroups(gateway, pattern), confirmations, access: new OpenAccess(), admins: {isAdmin: async () => admin}, replies, logger: silentLogger, timezone: "UTC", clock: () => new Date(now), maxActive: 2})
  const confirmDesk = new ConfirmDesk({gateway, confirmations, access: new OpenAccess(), replies, logger: silentLogger})
  /** a private message routed as the bot does: the ConfirmDesk first, then the PollDesk */
  const handle = async (text, overrides) => {
    const m = directMessage(text, overrides)
    return (await confirmDesk.handle(m)) || desk.handle(m)
  }
  const pending = () => timers.filter(Boolean)
  /** runs the timers pending now (not the ones they arm), so a re-planning board cannot loop forever */
  const fire = async () => {
    const due = timers.map((t, i) => [i, t]).filter(([, t]) => t)
    for (const [i] of due) timers[i] = null
    for (const [, t] of due) await t.fn()
    await tick()
  }
  const lastText = () => gateway.sent.at(-1).text
  const react = (sender, itemId, emoji, added = true) => board.onReaction({chat: GROUP, itemId, sender, emoji, added})
  return {gateway, polls, board, desk, handle, pending, fire, lastText, react, at: (iso) => (now = Date.parse(iso)), advance: (ms) => (now += ms)}
}

test("a poll is drafted, previewed, published after confirmation, voted on with reactions and the message is edited", async () => {
  const {gateway, polls, handle, board, fire, lastText, react} = setup()
  assert.equal(await handle("/list"), false)
  assert.equal(await handle("/vote"), true)
  assert.match(lastText(), /^No active polls\.\n\nCreate one:[\s\S]*\nHelp: \/vote \?$/)
  await handle("/vote confirm")
  assert.match(lastText(), /^Nothing to confirm/)
  await handle("/vote When shall we meet? | Monday 18:30 | Tuesday 18:30 | Wednesday 19:00 --days 3")
  assert.equal(lastText(), "NEW POLL\n\nWhen shall we meet?\n\n👍 Monday 18:30\n😀 Tuesday 18:30\n😂 Wednesday 19:00\n\nMode: one option\nDuration: 3 days\nGroup: filedrop\nCloses: 12.09.2026, 12:00\n\nConfirm: /confirm\nDrop: /drop")
  assert.deepEqual(polls.list(), [], "nothing stored before the confirmation")
  assert.deepEqual(gateway.sent.map((m) => m.chat.type), ["direct", "direct", "direct"], "nothing in the group yet")

  await handle("/гол подтвердить")
  const post = gateway.sent.at(-2)
  assert.deepEqual(post.chat, {type: "group", id: 1, name: "filedrop"})
  assert.equal(post.text, "POLL #1\n\nWhen shall we meet?\n\n👍 Monday 18:30\n😀 Tuesday 18:30\n😂 Wednesday 19:00\n\nChoose one option with a reaction.\nCloses: 12.09.2026, 12:00")
  assert.equal(lastText(), 'Poll #1 is published in the group "filedrop".\n\nOpen: /vote 1\nClose early: /vote close 1')
  const poll = polls.get(1)
  assert.equal(poll.status, "open")
  const itemId = poll.itemId
  assert.equal(typeof itemId, "number")

  // votes: reactions on that message; edits are coalesced
  await react(BOB, itemId, "👍")
  await react(CAROL, itemId, "😀")
  await react(BOB, itemId, "😀") // bob changes his mind
  assert.deepEqual(gateway.edits, [], "edited after a short quiet period, not per reaction")
  await fire()
  assert.equal(gateway.edits.length, 1)
  assert.deepEqual(gateway.edits[0].chat, {type: "group", id: 1, name: "filedrop"})
  assert.equal(gateway.edits[0].text, "POLL #1\n\nWhen shall we meet?\n\n👍 Monday 18:30 · 0\n😀 Tuesday 18:30 · 2\n😂 Wednesday 19:00 · 0\n\nChoose one option with a reaction.\n2 votes\nCloses: 12.09.2026, 12:00")
  await react(BOB, itemId, "❤️") // not a poll reaction
  await react(BOB, 999, "👍") // some other message
  await board.onReaction({chat: OTHER_GROUP, itemId, sender: BOB, emoji: "👍", added: true})
  await fire()
  assert.equal(gateway.edits.length, 1, "nothing changed")

  await handle("/vote 1")
  assert.match(lastText(), /^POLL #1\n[\s\S]*\n2 votes\n[\s\S]*\n\nClose early: \/vote close 1$/)
  await handle("/vote")
  assert.equal(lastText(), "ACTIVE POLLS\n\n1  When shall we meet?\n   2 votes · until 12.09.2026, 12:00\n\nOpen: /vote 1\nCreate: /vote <question> | <option 1> | <option 2>\nHelp: /vote ?")

  // closing early: the message is rewritten with the result
  await handle("/vote close 1")
  assert.match(lastText(), /^Poll #1 is closed\.\n\nPOLL #1 · CLOSED\n\nWhen shall we meet\?\n\n👍 Monday 18:30 · 0\n😀 Tuesday 18:30 · 2 · chosen\n😂 Wednesday 19:00 · 0\n\n2 votes\nEnded: 09\.09\.2026, 12:00$/)
  assert.equal(gateway.edits.at(-1).text, lastText().replace("Poll #1 is closed.\n\n", ""))
  await react(BOB, itemId, "👍")
  await fire()
  assert.equal(polls.get(1).ballots["5"].choices[0], 1, "a closed poll ignores reactions")
  await handle("/vote history")
  assert.equal(lastText(), "POLL HISTORY · 1\n\n1  When shall we meet?\n   2 votes · 09.09.2026\n\nOpen: /vote <number>")
  await handle("/vote 7")
  assert.match(lastText(), /^There is no poll #7/)
})

test("drafts: only one at a time, dropped by /vote cancel; errors and limits are explained; multiple choice", async () => {
  const {gateway, handle, lastText, react, fire, polls} = setup()
  await handle("/vote When Monday Tuesday")
  assert.match(lastText(), /^Could not separate the question/)
  await handle("/vote Q | a | b --days x")
  assert.match(lastText(), /whole number of days/)
  await handle("/vote First? | a | b")
  await handle("/vote Second? | c | d --multiple")
  await handle("/vote cancel")
  assert.equal(lastText(), "Dropped, nothing changed.")
  await handle("/vote confirm")
  assert.match(lastText(), /^Nothing to confirm/)
  assert.deepEqual(polls.list(), [])

  await handle("/vote Days? | Mon | Tue | Wed --multiple")
  await handle("/vote confirm")
  assert.match(gateway.sent.at(-2).text, /Choose any number of options with reactions\./)
  await react(BOB, polls.get(1).itemId, "👍")
  await react(BOB, polls.get(1).itemId, "😂")
  await fire()
  assert.match(gateway.edits.at(-1).text, /👍 Mon · 1\n😀 Tue · 0\n😂 Wed · 1\n\nChoose any number[\s\S]*\n1 vote$/)

  await handle("/vote Second? | c | d")
  await handle("/vote confirm")
  await handle("/vote Third? | e | f")
  assert.equal(lastText(), "You already have 2 active polls.\n\nClose one: /vote close <number>")
})

test("only the author or an admin manages a poll; cancelling a published poll needs a confirmation", async () => {
  const {gateway, handle, lastText, polls} = setup()
  await handle("/vote Q? | a | b")
  await handle("/vote confirm")
  await handle("/vote close 1", {sender: BOB, chat: bobChat})
  assert.equal(lastText(), "Only its author or an admin may manage poll #1.")
  await handle("/vote cancel 1", {sender: BOB, chat: bobChat})
  assert.equal(lastText(), "Only its author or an admin may manage poll #1.")
  await handle("/vote cancel 1")
  assert.match(lastText(), /^Cancel poll #1 "Q\?"\?/)
  assert.equal(polls.get(1).status, "open", "not before the confirmation")
  await handle("/vote cancel")
  assert.equal(lastText(), "Dropped, nothing changed.")
  await handle("/vote cancel 1")
  await handle("/vote confirm")
  assert.equal(lastText(), "Poll #1 is cancelled.")
  assert.equal(polls.get(1).status, "cancelled")
  assert.match(gateway.edits.at(-1).text, /^POLL #1 · CANCELLED\n/)
  await handle("/vote close 1")
  assert.equal(lastText(), "Poll #1 is already closed or cancelled.")

  const {handle: adminHandle, lastText: adminText, polls: polls2} = setup({admin: true})
  await adminHandle("/vote Q? | a | b", {sender: BOB, chat: bobChat})
  await adminHandle("/vote confirm", {sender: BOB, chat: bobChat})
  await adminHandle("/vote close 1")
  assert.match(adminText(), /^Poll #1 is closed\./)
  assert.equal(polls2.get(1).status, "closed")
})

test("several groups need --group; unknown group names are refused", async () => {
  const {handle, lastText, gateway} = setup({pattern: "filedrop*", groups: [GROUP, {type: "group", id: 3, name: "filedrop_1", title: "Philosophy", memberStatus: "connected"}]})
  await handle("/vote Q? | a | b")
  assert.equal(lastText(), "I serve several groups - say where to publish: --group <name>. Groups: filedrop, Philosophy.")
  await handle("/vote Q? | a | b --group Nowhere")
  assert.equal(lastText(), 'I have no group "Nowhere". Groups: filedrop, Philosophy.')
  await handle("/vote Q? | a | b --group philosophy")
  assert.match(lastText(), /Group: Philosophy/)
  await handle("/vote confirm")
  assert.deepEqual(gateway.sent.at(-2).chat, {type: "group", id: 3, name: "Philosophy"})
})

test("deadlines close polls on time, in bounded steps; a restart rebuilds the ballots from the reactions", async () => {
  const {gateway, polls, board, handle, pending, fire, advance, react} = setup()
  await handle("/vote Q? | a | b --days 1")
  await handle("/vote confirm")
  assert.deepEqual(pending().map((t) => t.ms), [6 * 3_600_000], "waits at most six hours at a time")
  await react(BOB, polls.get(1).itemId, "👍")
  await fire() // the edit timer and the first deadline step
  advance(6 * 3_600_000)
  await fire()
  assert.equal(polls.get(1).status, "open")
  advance(18 * 3_600_000 + 1)
  await fire()
  await fire()
  assert.equal(polls.get(1).status, "closed")
  assert.match(gateway.edits.at(-1).text, /^POLL #1 · CLOSED[\s\S]*👍 a · 1 · chosen/)

  // a second bot instance starts while another poll is open: the CLI's reaction lists are the truth
  await handle("/vote R? | x | y")
  await handle("/vote confirm")
  const itemId = polls.get(2).itemId
  gateway.reactions[`1:${itemId}:👍`] = [{contactId: 4, name: "bob", memberId: 5, at: "2026-09-09T13:00:00Z"}]
  gateway.reactions[`1:${itemId}:😀`] = [{contactId: 4, name: "bob", memberId: 5, at: "2026-09-09T13:30:00Z"}, {contactId: 9, name: "carol", memberId: 7, at: "2026-09-09T13:10:00Z"}]
  const restarted = new PollBoard({gateway, polls, replies, logger: silentLogger, timezone: "UTC", setTimer: () => 1, clearTimer: () => {}})
  await restarted.start()
  assert.deepEqual(polls.get(2).ballots, {5: {name: "bob", choices: [1], at: "2026-09-09T13:30:00Z"}, 7: {name: "carol", choices: [1], at: "2026-09-09T13:10:00Z"}})
  assert.match(gateway.edits.at(-1).text, /😀 y · 2/)
  board.stop()
})

test("without --days a poll has no deadline; it closes by itself after 8 days without a vote, a vote restarts the count", async () => {
  const {gateway, polls, handle, pending, lastText, advance, fire, react} = setup()
  await handle("/vote Where shall we read? | Library | Cafe")
  assert.equal(lastText(), "NEW POLL\n\nWhere shall we read?\n\n👍 Library\n😀 Cafe\n\nMode: one option\nDuration: no limit; closes after 8 days without a vote\nGroup: filedrop\n\nConfirm: /confirm\nDrop: /drop")
  await handle("/confirm")
  const [poll] = polls.list()
  assert.equal(poll.closesAt, null)
  assert.equal(poll.idleDays, 8)
  const post = gateway.sent.find((m) => m.chat.type === "group")
  assert.match(post.text, /\nChoose one option with a reaction\.$/, "the group message says nothing about closing")
  assert.equal(lastText(), 'Poll #1 is published in the group "filedrop".\n\nNo deadline: if nobody votes for 8 days, the poll closes by itself.\n\nOpen: /vote 1\nClose: /vote close 1', "the author is told privately")
  assert.equal(pending().length, 1, "the idle closing is planned")
  await handle("/vote")
  assert.match(lastText(), /\n {3}0 votes · closes 17\.09\.2026, 12:00 unless someone votes\n/)
  advance(6 * 86_400_000)
  await react(BOB, poll.itemId, "👍") // day 6: the count starts again
  await fire()
  advance(7 * 86_400_000)
  await fire()
  assert.equal(polls.list()[0].status, "open", "7 days after the vote: still open")
  advance(86_400_000 + 1000)
  await fire()
  const closed = polls.list()[0]
  assert.equal(closed.status, "closed")
  assert.equal(closed.closedBy, "idle")
  const edit = gateway.edits.at(-1)
  assert.match(edit.text, /^POLL #1 · CLOSED\n/)
  assert.match(edit.text, /\nEnded: 23\.09\.2026, 12:00 · 8 days without a vote$/)
})

test("a poll with --days keeps its deadline: no idle closing", async () => {
  const {polls, handle, advance, fire} = setup()
  await handle("/vote Q? | a | b --days 20")
  await handle("/confirm")
  assert.equal(polls.list()[0].idleDays, null)
  advance(10 * 86_400_000)
  await fire()
  assert.equal(polls.list()[0].status, "open", "10 days without votes, the deadline is day 20")
})
