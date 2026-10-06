/**
 * Private-chat behaviour that runs before every other handler: a contact who
 * sends more messages than the limit allows gets one "slow down" reply and
 * is then ignored until their window clears.
 */
export class Throttle {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("./RateLimiter.js").RateLimiter} deps.limiter
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   */
  constructor({gateway, limiter, replies, logger}) {
    this.gateway = gateway
    this.limiter = limiter
    this.replies = replies
    this.logger = logger
  }

  /** @returns {Promise<boolean>} true if the message must not be handled further */
  async handle(message) {
    if (!message.isDirect || !message.incoming) return false
    const verdict = this.limiter.hit(message.sender.contactId ?? message.chat.id)
    if (verdict === "ok") return false
    if (verdict === "limit") {
      this.logger.info(`rate limit reached by ${message.sender.name}`)
      await this.gateway.sendText(message.chat, this.replies.slowDownText())
    } else {
      this.logger.debug(`dropping message from rate-limited ${message.sender.name}`)
    }
    return true
  }

  describe() {
    return Number.isFinite(this.limiter.limit) ? `${this.limiter.limit} messages per ${this.limiter.windowMs / 1000}s per contact` : "no rate limit"
  }
}
