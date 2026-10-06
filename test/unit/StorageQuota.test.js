import test from "node:test"
import assert from "node:assert/strict"
import {StorageQuota} from "../../src/bot/StorageQuota.js"

const store = (used = 500, diskFree = 300) => ({usedBytes: () => used, freeDiskBytes: () => diskFree})

test("reserves in-flight downloads within the limit and the free disk space", () => {
  const quota = new StorageQuota(store(), 1000)
  assert.deepEqual(quota.reserve(1, 200), {ok: true})
  assert.equal(quota.usage().free, 300)
  assert.equal(quota.isReserved(1), true)
  assert.equal(quota.reserve(2, 301).ok, false) // over the limit with the reservation
  assert.equal(quota.release(1), true)
  assert.equal(quota.release(1), false)
  assert.match(quota.reserve(2, 301).reason, /disk/) // fits the limit, not the disk
  assert.equal(quota.reserve(3, 300).ok, true)
})

test("a reservation with an unknown size is refused instead of disabling the limit", () => {
  const quota = new StorageQuota(store(), 1000)
  assert.equal(quota.reserve(1, undefined).ok, false)
  assert.equal(quota.reserve(2, NaN).ok, false)
  assert.equal(quota.usage().reserved, 0)
  assert.equal(quota.reserve(3, 100).ok, true)
})

test("reservations expire after the stale timeout so a stalled download does not block the archive", () => {
  let now = 0
  const quota = new StorageQuota(store(0, null), 1000, {staleAfterMs: 6 * 3_600_000, clock: () => now})
  quota.reserve(1, 900)
  now = 5 * 3_600_000 + 59 * 60_000
  assert.equal(quota.isReserved(1), true)
  assert.equal(quota.usage().reserved, 900)
  now = 6 * 3_600_000 + 1
  assert.equal(quota.isReserved(1), false)
  assert.equal(quota.usage().reserved, 0)
  assert.equal(quota.reserve(2, 900).ok, true)
})
