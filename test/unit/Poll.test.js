import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {POLL_REACTIONS, castBallot, closingTime, newPoll, optionOfReaction, parsePollCommand, rebuildBallots, tally} from "../../src/domain/Poll.js"
import {PollStore} from "../../src/storage/PollStore.js"

const NOW = new Date("2026-09-09T12:00:00Z")
const ALICE = {contactId: 3, name: "alice"}
const GROUP = {id: 1, name: "filedrop", title: "Philosophy"}

test("parsePollCommand: subcommands, numbers, creation with flags, errors", () => {
  assert.deepEqual(parsePollCommand(""), {action: "list"})
  assert.deepEqual(parsePollCommand("помощь"), {action: "help"})
  assert.deepEqual(parsePollCommand("history"), {action: "history"})
  assert.deepEqual(parsePollCommand("подтвердить"), {action: "confirm"})
  assert.deepEqual(parsePollCommand("отменить"), {action: "drop"})
  assert.deepEqual(parsePollCommand("о"), {action: "drop"})
  assert.deepEqual(parsePollCommand("о 4"), {action: "cancel", id: 4})
  assert.deepEqual(parsePollCommand("з 2"), {action: "close", id: 2})
  assert.deepEqual(parsePollCommand("и"), {action: "history"})
  assert.deepEqual(parsePollCommand("cancel 12"), {action: "cancel", id: 12})
  assert.deepEqual(parsePollCommand("закрыть 7"), {action: "close", id: 7})
  assert.deepEqual(parsePollCommand("закрыть"), {action: "close", id: null})
  assert.deepEqual(parsePollCommand("12"), {action: "show", id: 12})
  assert.deepEqual(parsePollCommand("Когда провести занятие? | Понедельник 18:30 | Вторник 18:30"), {action: "create", question: "Когда провести занятие?", options: ["Понедельник 18:30", "Вторник 18:30"], days: null, multiple: false, group: null}, "no deadline unless one is given")
  assert.deepEqual(parsePollCommand("В какие дни? | Пн | Вт | Ср --несколько --дней 5 --группа Ethics"), {action: "create", question: "В какие дни?", options: ["Пн", "Вт", "Ср"], days: 5, multiple: true, group: "Ethics"})
  assert.equal(parsePollCommand("When? | Mon | Tue --multiple --days 3").days, 3)
  assert.deepEqual(parsePollCommand("Когда провести занятие Понедельник Вторник"), {action: "error", code: "noSeparator"})
  assert.deepEqual(parsePollCommand("Когда? | Понедельник"), {action: "error", code: "fewOptions"})
  assert.deepEqual(parsePollCommand(" | a | b"), {action: "error", code: "fewOptions"})
  assert.deepEqual(parsePollCommand(`Q | ${Array.from({length: POLL_REACTIONS.length + 1}, (_, i) => `o${i}`).join(" | ")}`), {action: "error", code: "tooManyOptions"})
  assert.deepEqual(parsePollCommand("Q | a | b --дней 0"), {action: "error", code: "badDays"})
  assert.deepEqual(parsePollCommand("Q | a | b --дней много"), {action: "error", code: "badDays"})
})

test("reactions map to options, with or without the variation selector; ballots follow the mode", () => {
  assert.equal(optionOfReaction("👍"), 0)
  assert.equal(optionOfReaction("👍️"), 0)
  assert.equal(optionOfReaction("❤️"), -1)
  const poll = newPoll({question: "Q", options: ["a", "b", "c"], days: 7, multiple: false, author: ALICE, group: GROUP, now: NOW})
  assert.equal(poll.closesAt, "2026-09-16T12:00:00.000Z")
  const open = newPoll({question: "Q", options: ["a", "b"], days: null, multiple: false, author: ALICE, group: GROUP, idleDays: 8, now: NOW})
  assert.equal(open.closesAt, null, "an open-ended poll has no deadline")
  assert.equal(closingTime(open), NOW.getTime() + 8 * 86_400_000, "8 days after creation while nobody votes")
  castBallot(open, "m1", "bob", 0, true, new Date(NOW.getTime() + 86_400_000))
  assert.equal(closingTime(open), NOW.getTime() + 9 * 86_400_000, "a vote restarts the count")
  assert.equal(closingTime({...open, idleDays: null}), null, "an old poll without the rule and no fallback: only its author ends it")
  assert.equal(closingTime(poll), Date.parse("2026-09-16T12:00:00.000Z"), "a deadline wins")
  assert.equal(poll.group.name, "Philosophy")
  assert.equal(castBallot(poll, "m5", "bob", 0, true, NOW), true)
  assert.equal(castBallot(poll, "m5", "bob", 1, true, NOW), true, "single choice: the last reaction wins")
  assert.deepEqual(poll.ballots.m5.choices, [1])
  assert.equal(castBallot(poll, "m5", "bob", 0, false, NOW), false, "withdrawing an option not held changes nothing")
  assert.equal(castBallot(poll, "m5", "bob", 1, false, NOW), true)
  assert.deepEqual(poll.ballots, {}, "withdrawing the only choice removes the ballot")
  assert.equal(castBallot(poll, "m5", "bob", 9, true, NOW), false, "unknown option ignored")
  const multi = newPoll({question: "Q", options: ["a", "b", "c"], days: 7, multiple: true, author: ALICE, group: GROUP, now: NOW})
  castBallot(multi, "m5", "bob", 0, true, NOW)
  castBallot(multi, "m5", "bob", 2, true, NOW)
  castBallot(multi, "m6", "carol", 2, true, NOW)
  assert.deepEqual(multi.ballots.m5.choices, [0, 2])
  assert.deepEqual(tally(multi), {counts: [1, 0, 2], participants: 2, leaders: [2]})
  castBallot(multi, "m6", "carol", 2, false, NOW)
  assert.deepEqual(tally(multi), {counts: [1, 0, 1], participants: 1, leaders: [0, 2]})
  assert.deepEqual(tally(poll), {counts: [0, 0, 0], participants: 0, leaders: []})
})

test("rebuildBallots from the reactions the CLI reports (single choice: the latest)", () => {
  const poll = newPoll({question: "Q", options: ["a", "b"], days: 7, multiple: false, author: ALICE, group: GROUP, now: NOW})
  rebuildBallots(poll, [
    {option: 0, members: [{key: "m5", name: "bob", at: "2026-09-09T10:00:00Z"}, {key: "m6", name: "carol", at: "2026-09-09T10:05:00Z"}]},
    {option: 1, members: [{key: "m5", name: "bob", at: "2026-09-09T11:00:00Z"}]},
  ])
  assert.deepEqual(poll.ballots.m5.choices, [1])
  assert.deepEqual(poll.ballots.m6.choices, [0])
  poll.multiple = true
  rebuildBallots(poll, [{option: 0, members: [{key: "m5", name: "bob", at: "2026-09-09T10:00:00Z"}]}, {option: 1, members: [{key: "m5", name: "bob", at: "2026-09-09T11:00:00Z"}]}])
  assert.deepEqual(poll.ballots.m5.choices, [0, 1])
})

test("PollStore numbers polls, finds them by their group message and survives a restart", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-polls-")), "state", "polls.json")
  const store = new PollStore(file)
  assert.deepEqual(store.list(), [])
  const a = store.add(newPoll({question: "A", options: ["x", "y"], days: 7, multiple: false, author: ALICE, group: GROUP, now: NOW}))
  const b = store.add(newPoll({question: "B", options: ["x", "y"], days: 7, multiple: false, author: ALICE, group: GROUP, now: NOW}))
  assert.deepEqual([a.id, b.id], [1, 2])
  store.save({...b, itemId: 55, status: "open"})
  assert.equal(store.findByPost(1, 55).question, "B")
  assert.equal(store.findByPost(1, 56), null)
  assert.equal(new PollStore(file).get(2).itemId, 55)
  assert.equal(new PollStore(file).add(a).id, 3, "ids are never reused")
})
