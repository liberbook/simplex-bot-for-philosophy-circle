/**
 * Tells subscribers about changes to a class - one private message per class
 * per subscriber after a quiet period, so a burst of edits and uploads
 * becomes a single note. Timers are injectable for tests.
 */
export class Notifier {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("../storage/SubscriberStore.js").SubscriberStore} deps.subscribers
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {number} [deps.delayMs] quiet period before sending
   */
  constructor({gateway, subscribers, replies, logger, delayMs = 120_000, setTimer = setTimeout, clearTimer = clearTimeout}) {
    this.gateway = gateway
    this.subscribers = subscribers
    this.replies = replies
    this.logger = logger
    this.delayMs = delayMs
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.pending = new Map() // date -> {changes: [], timer}
  }

  /**
   * @param {string} date class date
   * @param {{kind: "post"|"edit"|"file"|"audio"|"moved"|"cancelled", by: string, name?: string, from?: string}} change
   */
  changed(date, change) {
    const entry = this.pending.get(date) ?? {changes: [], timer: null}
    entry.changes.push(change)
    if (entry.timer) this.clearTimer(entry.timer)
    entry.timer = this.setTimer(() => this.#flush(date), this.delayMs)
    this.pending.set(date, entry)
  }

  async #flush(date) {
    const entry = this.pending.get(date)
    this.pending.delete(date)
    if (!entry) return
    const recipients = this.subscribers.list()
    if (recipients.length === 0) return
    const text = this.replies.sessionChangedText(date, entry.changes)
    this.logger.info(`notifying ${recipients.length} subscriber(s) about class ${date}`)
    for (const s of recipients) {
      try {
        await this.gateway.sendText({type: "direct", id: s.contactId, name: s.name}, text)
      } catch (e) {
        this.logger.warn(`cannot notify ${s.name}: ${e.message}`)
      }
    }
  }
}
