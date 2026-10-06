/**
 * Keeps the bot's direct contacts honest. When a member deletes the chat with
 * the bot, the bot's copy of the contact lingers and keeps the group member
 * linked to a dead connection - SimpleX then refuses to link that member to
 * any new contact. So such contacts are removed here: on the deletion event,
 * at start-up, and when a message to them fails.
 */
export class ContactBook {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {Array<(contactId: number) => void>} [deps.onForget] what else to drop with a contact (subscriptions, admin rights)
   */
  constructor({gateway, logger, onForget = []}) {
    this.gateway = gateway
    this.logger = logger
    this.onForget = onForget
  }

  /** At start-up: drop the contacts whose other side is gone. @returns {Promise<number>} how many were removed */
  async cleanup() {
    let removed = 0
    for (const c of await this.gateway.listContacts()) {
      if (c.status === "active") continue
      if (await this.forget(c.contactId, c.name, `status ${c.status}`)) removed++
    }
    return removed
  }

  /** The other side deleted the chat: remove our copy so the group member can be linked again. */
  async onContactDeleted(contact) {
    await this.forget(contact.contactId, contact.name, "deleted by the other side")
  }

  /**
   * How a contact stands: "active" (can be written to), "pending" (invited,
   * not connected yet) or "gone" (deleted on the other side or unknown).
   */
  async state(contactId) {
    const contact = (await this.gateway.listContacts()).find((c) => c.contactId === contactId)
    if (!contact || contact.status !== "active" || contact.connStatus === "deleted") return "gone"
    return contact.connStatus === "ready" || contact.connStatus === "snd-ready" || contact.connStatus === "sndReady" ? "active" : "pending"
  }

  /** @returns {Promise<boolean>} whether the contact was removed */
  async forget(contactId, name, why) {
    try {
      await this.gateway.deleteContact(contactId)
      for (const forget of this.onForget) forget(contactId)
      this.logger.info(`contact ${name} removed (${why})`)
      return true
    } catch (e) {
      this.logger.warn(`cannot remove contact ${name}: ${e.message}`)
      return false
    }
  }
}
