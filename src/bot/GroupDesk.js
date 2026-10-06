import {CommandKind, parseGroupCommand} from "../domain/Command.js"
import {RateLimiter} from "./RateLimiter.js"
import {memberKey, PrivateLine} from "./PrivateLine.js"

const HELP_WORDS = /^(\?\??|помощь|help|all|все|всё)$/iu // "/spinoza ?" and "/spinoza ??" both ask for the full help
const LIMIT_MINUTES = 10
/** commands that belong to the group (the Curator answers them); everything else recognised is private */
const GROUP_COMMANDS = new Set([CommandKind.SPINOZA, CommandKind.SESSION, CommandKind.SCHEDULE, CommandKind.LAST])

/**
 * "/spinoza" - the group's single entry point to the bot, and the greeting
 * when the bot joins a group. A member with a private chat gets the help sent
 * there and a one-line confirmation in the group. A member without one gets a
 * private chat opened through the group (the member's app joins by itself and
 * receives the help as the first message); when the group forbids direct
 * messages, a one-time link is posted instead (the same one again while it is
 * fresh). A contact whose other side deleted the chat is removed and replaced
 * the same way. Group answers stay short on purpose.
 */
export class GroupDesk {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("./WatchedGroups.js").WatchedGroups} deps.groups
   * @param {import("../ethics/Citations.js").Citations} deps.citations
   * @param {{isAdmin(sender): Promise<boolean>}} [deps.admins] for the full help sent privately
   * @param {import("./ContactBook.js").ContactBook} deps.contacts tells dead contacts from pending ones and removes the dead
   * @param {import("../i18n/en.js").en} deps.replies texts in the configured language
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {import("./RateLimiter.js").RateLimiter} [deps.limiter] default 3 per member per 10 minutes
   * @param {import("./RateLimiter.js").RateLimiter} [deps.hintLimiter] the same for "this is done privately" hints - separate, so hints never eat /spinoza's budget
   * @param {number} [deps.linkTtlMs] how long a one-time link is handed out again instead of a new one
   * @param {PrivateLine} [deps.line] opens private chats (shared with the Courier, so a link is the same for both)
   */
  constructor({gateway, groups, citations, contacts, admins = {isAdmin: async () => false}, replies, logger, limiter = new RateLimiter({limit: 3, windowMs: LIMIT_MINUTES * 60_000}), hintLimiter = new RateLimiter({limit: 3, windowMs: LIMIT_MINUTES * 60_000}), clock = () => Date.now(), linkTtlMs = 60 * 60_000, line = new PrivateLine({gateway, contacts, logger, clock, linkTtlMs})}) {
    this.gateway = gateway
    this.groups = groups
    this.citations = citations
    this.admins = admins
    this.replies = replies
    this.logger = logger
    this.limiter = limiter
    this.hintLimiter = hintLimiter
    this.line = line
  }

  /** The bot joined a served group: the short group help with a quotation. */
  async greet(group) {
    await this.gateway.sendText(group, this.replies.groupGreetingText(this.citations.next()))
  }

  /** @param {import("../domain/Message.js").Message} message */
  async handle(message) {
    if (!message.isGroup || !message.incoming || message.hasFile || !this.groups.matches(message.chat)) return
    const {kind, argument} = parseGroupCommand(message.text)
    const {sender, chat} = message
    if (kind !== CommandKind.SPINOZA) {
      // a private command typed in the group ("/список", "/этика Э1т7", "/?"): one line saying where it works, never silence
      if (kind !== CommandKind.UNKNOWN && !GROUP_COMMANDS.has(kind) && /^\/\S/.test(message.text.trim()) && this.hintLimiter.hit(memberKey(chat, sender)) === "ok") {
        this.logger.info(`${sender.name}: private command ${kind} in #${chat.name}`)
        await this.gateway.sendText(chat, this.replies.privateOnlyText(), {}, message.itemId)
      }
      return
    }
    const verdict = this.limiter.hit(memberKey(chat, sender))
    if (verdict !== "ok") {
      this.logger.debug(`ignoring repeated /spinoza from ${sender.name} in #${chat.name}`)
      if (verdict === "limit") await this.gateway.sendText(chat, this.replies.slowDownText(LIMIT_MINUTES), {}, message.itemId) // said once, then silence
      return
    }
    if (sender.contactId === null || sender.contactId === undefined) return this.#connect(message)
    const full = HELP_WORDS.test(argument)
    const privately = {type: "direct", id: sender.contactId, name: sender.name}
    try {
      await this.gateway.sendText(privately, full ? this.replies.withQuotationText(this.citations.next(), this.replies.helpText(await this.admins.isAdmin(sender), true, true)) : this.replies.spinozaHelpText(this.citations.next()))
    } catch (e) {
      const state = await this.line.afterFailure(sender.contactId, sender.name, e)
      if (state === "pending") return this.gateway.sendText(chat, this.replies.spinozaPendingText(), {}, message.itemId)
      if (state === "active") return
      return this.#connect(message)
    }
    this.logger.info(`${sender.name}: /spinoza${full ? " help" : ""} in #${chat.name} - sent privately`)
    await this.gateway.sendText(chat, this.replies.spinozaHelpSentText(), {}, message.itemId)
  }

  /** No usable private chat: open one through the group, with the help as the first message; else a one-time link. */
  async #connect(message) {
    const opened = await this.line.open(message, this.replies.spinozaHelpText(this.citations.next()))
    await this.gateway.sendText(message.chat, opened.link ? this.replies.spinozaLinkText(opened.link) : this.replies.spinozaChatOpenedText(), {}, message.itemId)
  }
}
