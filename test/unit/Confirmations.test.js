import test from "node:test"
import assert from "node:assert/strict"
import {Confirmations} from "../../src/bot/Confirmations.js"
import {fitLines, shortFileName} from "../../src/i18n/layout.js"

const ALICE = {contactId: 3, name: "alice"}
const BOB = {contactId: 4, name: "bob"}

test("a previewed action runs once on take, only for the same person and only while fresh; a new preview replaces the old one", () => {
  let now = 0
  const c = new Confirmations({ttlMs: 10 * 60_000, clock: () => now})
  assert.equal(c.take(ALICE), null)
  c.ask(ALICE, () => "first")
  c.ask(ALICE, () => "second")
  assert.equal(c.take(BOB), null, "someone else cannot confirm")
  assert.equal(c.take(ALICE)(), "second")
  assert.equal(c.take(ALICE), null, "used once")
  c.ask(ALICE, () => "late")
  now += 10 * 60_000 + 1
  assert.equal(c.take(ALICE), null, "expired")
  c.ask(BOB, () => "x")
  assert.equal(c.drop(BOB), true)
  assert.equal(c.drop(BOB), false)
  assert.equal(c.take(BOB), null, "dropped")
  const byName = new Confirmations()
  byName.ask({contactId: null, name: "dave"}, () => "d")
  assert.equal(byName.take({contactId: null, name: "dave"})(), "d", "a member without a contact is keyed by name")
})

test("shortFileName cuts long names keeping the extension", () => {
  assert.equal(shortFileName("reading.pdf"), "reading.pdf")
  assert.equal(shortFileName("Гольбах. Система природы на 12.07.26_1.pdf"), "Гольбах. Система природы на 12.07.26_1.pdf")
  assert.equal(shortFileName("Access to Arasaka - l a k e s - 01 EL54.flac"), "Access to Arasaka - l a k e s - 01 EL54…flac")
  assert.equal(shortFileName("x".repeat(60) + ".tar.gz"), "x".repeat(40) + "…gz")
  assert.equal(shortFileName("y".repeat(50)), "y".repeat(40) + "…", "no extension: just cut")
  assert.equal(shortFileName("short.txt", 5), "sho…txt")
})

test("fitLines stops at the character budget", () => {
  const items = ["a", "bb", "ccc", "dddd"]
  assert.deepEqual(fitLines(items, 100, (s, n) => `${n}. ${s}`), {lines: ["1. a", "2. bb", "3. ccc", "4. dddd"], shown: 4})
  assert.deepEqual(fitLines(items, 12, (s, n) => `${n}. ${s}`), {lines: ["1. a", "2. bb"], shown: 2})
  assert.deepEqual(fitLines(items, 12, (s, n) => `${n}. ${s}`, 8), {lines: [], shown: 0}, "a long heading leaves no room")
})
