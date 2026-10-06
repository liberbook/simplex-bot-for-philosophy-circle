/**
 * Sliding-window counter per key (a contact id, a member id). Pure logic with
 * an injectable clock, so tests never wait. Memory is bounded by the number
 * of keys times `limit`.
 */
export class RateLimiter {
  /**
   * @param {{limit: number, windowMs: number, clock?: () => number}} p
   *   limit    - events allowed per window (Infinity disables the limiter)
   *   windowMs - window length
   */
  constructor({limit, windowMs, clock = () => Date.now()}) {
    this.limit = limit
    this.windowMs = windowMs
    this.clock = clock
    this.events = new Map() // key -> ascending timestamps within the window
  }

  /**
   * Records one event.
   * @returns {"ok"|"limit"|"blocked"} "limit" exactly for the first event over the
   *   limit (say something once), "blocked" for every further one in the window
   */
  hit(key) {
    const times = this.#recent(key)
    times.push(this.clock())
    if (times.length <= this.limit) return "ok"
    return times.length === this.limit + 1 ? "limit" : "blocked"
  }

  /** Whether the key has reached the limit, without recording an event. */
  isLimited(key) {
    return this.#recent(key).length >= this.limit
  }

  reset(key) {
    this.events.delete(key)
  }

  #recent(key) {
    const cutoff = this.clock() - this.windowMs
    const times = (this.events.get(key) ?? []).filter((t) => t > cutoff)
    if (times.length === 0) this.events.delete(key)
    else this.events.set(key, times)
    return times.length === 0 ? this.#fresh(key) : times
  }

  #fresh(key) {
    const times = []
    this.events.set(key, times)
    return times
  }
}
