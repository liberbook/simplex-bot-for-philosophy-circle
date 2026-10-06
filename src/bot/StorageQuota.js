/**
 * Keeps the archive within a configured size and within the free disk space.
 * Downloads in flight are reserved so concurrent files cannot overshoot; a
 * reservation that is never completed (the sender vanished) expires after
 * `staleAfterMs`, so a stalled download cannot block the archive forever.
 */
export class StorageQuota {
  /**
   * @param {{usedBytes(): number, freeDiskBytes(): number|null}} store
   * @param {number} limitBytes
   * @param {{staleAfterMs?: number, clock?: () => number}} [options]
   */
  constructor(store, limitBytes, {staleAfterMs = 6 * 3_600_000, clock = () => Date.now()} = {}) {
    this.store = store
    this.limit = limitBytes
    this.staleAfterMs = staleAfterMs
    this.clock = clock
    this.reservations = new Map() // fileId -> {bytes, since}
  }

  usage() {
    this.#expire()
    const used = this.store.usedBytes()
    const reserved = [...this.reservations.values()].reduce((sum, r) => sum + r.bytes, 0)
    return {
      used,
      reserved,
      limit: this.limit,
      free: Math.max(0, this.limit - used - reserved),
      diskFree: this.store.freeDiskBytes(),
    }
  }

  /** @returns {{ok: true}|{ok: false, reason: string}} */
  reserve(fileId, bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return {ok: false, reason: "unknown file size"}
    const {free, diskFree} = this.usage()
    if (bytes > free) return {ok: false, reason: "archive size limit reached"}
    if (diskFree !== null && bytes > diskFree) return {ok: false, reason: "not enough free disk space"}
    this.reservations.set(fileId, {bytes, since: this.clock()})
    return {ok: true}
  }

  isReserved(fileId) {
    this.#expire()
    return this.reservations.has(fileId)
  }

  /** @returns {boolean} whether there was a reservation to release */
  release(fileId) {
    return this.reservations.delete(fileId)
  }

  #expire() {
    const cutoff = this.clock() - this.staleAfterMs
    for (const [fileId, r] of this.reservations) if (r.since < cutoff) this.reservations.delete(fileId)
  }
}
