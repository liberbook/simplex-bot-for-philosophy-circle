import test from "node:test"
import assert from "node:assert/strict"
import {RateLimiter} from "../../src/bot/RateLimiter.js"

function limiter(limit = 3, windowMs = 60_000) {
  let now = 1_000_000
  const l = new RateLimiter({limit, windowMs, clock: () => now})
  return {l, advance: (ms) => (now += ms)}
}

test("allows `limit` events, then says 'limit' once and 'blocked' afterwards", () => {
  const {l} = limiter()
  assert.deepEqual([l.hit("a"), l.hit("a"), l.hit("a"), l.hit("a"), l.hit("a")], ["ok", "ok", "ok", "limit", "blocked"])
  assert.equal(l.isLimited("a"), true)
  assert.equal(l.isLimited("b"), false) // keys are independent
  assert.equal(l.hit("b"), "ok")
})

test("the window slides and reset clears a key", () => {
  const {l, advance} = limiter()
  l.hit("a")
  l.hit("a")
  l.hit("a")
  assert.equal(l.isLimited("a"), true)
  advance(61_000)
  assert.equal(l.isLimited("a"), false)
  assert.equal(l.hit("a"), "ok")
  l.hit("a")
  l.hit("a")
  l.reset("a")
  assert.equal(l.hit("a"), "ok")
})

test("an infinite limit never limits", () => {
  const {l} = limiter(Infinity)
  for (let i = 0; i < 100; i++) assert.equal(l.hit("a"), "ok")
})
