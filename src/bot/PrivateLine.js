/**
 * Reaching a group member privately when the bot has no usable chat with them:
 * opens one through the group (the member's app shows a request with `firstText`
 * as its first message), or - when the group forbids direct messages - hands out
 * a one-time link (the same one again while it is fresh). Also tells, after a
 * failed private send, whether the chat is still being accepted or is gone (then
 * our dead copy is removed, so the member can be linked anew).
 * Shared by GroupDesk (/spinoza) and Courier (the fetch word).
 */
export class PrivateLine {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("./ContactBook.js").ContactBook} deps.contacts
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {number} [deps.linkTtlMs] how long a one-time link is handed out again instead of a new one
   */
  constructor({gateway, contacts, logger, clock = () => Date.now(), linkTtlMs = 60 * 60_000}) {
    this.gateway = gateway
    this.contacts = contacts
    this.logger = logger
    this.clock = clock
    this.linkTtlMs = linkTtlMs
    this.links = new Map() // member key -> {link, at}
  }

  /**
   * @param {import("../domain/Message.js").Message} message the member's group message
   * @returns {Promise<{contactId: number}|{link: string}>} a contact being opened, or a link to post
   */
  async open({sender, chat}, firstText) {
    if (sender.memberId !== undefined) {
      let contactId = null
      try {
        contactId = await this.gateway.createMemberContact(chat.id, sender.memberId)
        await this.gateway.sendMemberContactInvitation(contactId, firstText)
        this.logger.info(`${sender.name}: private chat opened through #${chat.name}`)
        return {contactId}
      } catch (e) {
        this.logger.info(`${sender.name}: cannot open a private chat through #${chat.name} (${e.message}) - offering a one-time link`)
        // a contact created but never invited would tie the member to it: SimpleX links a member to a new contact only while it has none
        if (contactId !== null) await this.gateway.deleteContact(contactId).catch((err) => this.logger.warn(`cannot remove the uninvited contact of ${sender.name}: ${err.message}`))
      }
    }
    return {link: await this.#link(chat, sender)}
  }

  /**
   * A private send to this contact failed: "pending" (the member has not accepted
   * the chat yet), "active" (the chat is fine - the failure was something else,
   * nothing is touched) or "gone" (the dead contact is removed now).
   */
  async afterFailure(contactId, name, error) {
    const state = await this.contacts.state(contactId)
    if (state === "pending") {
      this.logger.info(`${name}: private chat not connected yet (${error.message})`)
      return "pending"
    }
    if (state === "active") {
      this.logger.warn(`${name}: sending privately failed (${error.message})`)
      return "active"
    }
    // the member deleted the chat with the bot: drop our dead copy, so a new one can be opened
    this.logger.warn(`${name}: private chat not usable (${error.message}) - reconnecting`)
    await this.contacts.forget(contactId, name, "unreachable")
    return "gone"
  }

  async #link(chat, sender) {
    const key = memberKey(chat, sender)
    const known = this.links.get(key)
    if (known && this.clock() - known.at < this.linkTtlMs) {
      this.logger.debug(`${sender.name} gets the same one-time link again in #${chat.name}`)
      return known.link
    }
    const link = await this.gateway.createInvitation()
    this.links.set(key, {link, at: this.clock()})
    this.logger.info(`${sender.name} gets a one-time link in #${chat.name}`)
    return link
  }
}

export const memberKey = (chat, sender) => `${chat.id}:${sender.memberId ?? sender.name}`
