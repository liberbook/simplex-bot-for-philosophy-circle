/**
 * Actions that wait for "/подтвердить": a schedule change, a move or a
 * cancellation of a class, a new poll or a poll's cancellation is previewed first and carried out only when the same person
 * confirms within `ttlMs`; "/отменить" drops it. One pending action per
 * person - a new preview replaces the old one. Pure bookkeeping, no I/O.
 */
export class Confirmations {
  /** @param {{ttlMs?: number, clock?: () => number}} [options] */
  constructor({ttlMs = 10 * 60_000, clock = () => Date.now()} = {}) {
    this.ttlMs = ttlMs
    this.clock = clock
    this.pending = new Map() // person key -> {run, askedAt}
  }

  /**
   * @param {{contactId?: number|null, name: string}} sender
   * @param {() => Promise<string|void>|string|void} run carries the action out; may return a text to answer with
   */
  ask(sender, run) {
    this.pending.set(keyOf(sender), {run, askedAt: this.clock()})
  }

  /** The pending action of this person, removed; null when there is none or it expired. */
  take(sender) {
    const key = keyOf(sender)
    const ask = this.pending.get(key)
    this.pending.delete(key)
    return ask && this.clock() - ask.askedAt <= this.ttlMs ? ask.run : null
  }

  /** Forgets the pending action. @returns {boolean} whether there was a fresh one */
  drop(sender) {
    return this.take(sender) !== null
  }
}

const keyOf = (sender) => String(sender.contactId ?? sender.name)
