/**
 * Greets a new private contact: a quotation from the Ethics and the first
 * commands to try - the member ones, or only the Ethics for a stranger.
 * SimpleX links a new contact to the group member a few seconds after the
 * connection (it probes both sides first), so the greeting waits a little for
 * that link before deciding whom it is talking to.
 */
export class Greeter {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("../ethics/Citations.js").Citations} deps.citations
   * @param {{allows(sender): Promise<boolean>}} deps.access decides whether the greeting shows the member commands
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {number} [deps.attempts] how many times to look for the member link
   * @param {number} [deps.delayMs] pause between the looks
   */
  constructor({gateway, citations, access, replies, logger, attempts = 8, delayMs = 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms))}) {
    this.gateway = gateway
    this.citations = citations
    this.access = access
    this.replies = replies
    this.logger = logger
    this.attempts = attempts
    this.delayMs = delayMs
    this.sleep = sleep
  }

  async greet(contact) {
    this.logger.info(`new contact: ${contact.name}`)
    let isMember = await this.access.allows(contact)
    for (let i = 1; !isMember && i < this.attempts; i++) {
      await this.sleep(this.delayMs)
      isMember = await this.access.allows(contact)
    }
    await this.gateway.sendText({type: "direct", id: contact.contactId, name: contact.name}, this.replies.greetingText(this.citations.next(), isMember))
  }
}
