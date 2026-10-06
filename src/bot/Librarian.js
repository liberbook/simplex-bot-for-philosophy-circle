import {sendThrough} from "../storage/Outbox.js"
import {CommandKind, parseCommand, resolveSection, suggestCommand} from "../domain/Command.js"

/**
 * Private-chat behaviour: answers commands from users - listing the archive
 * and sending files back - subject to the access policy.
 */
export class Librarian {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("../storage/FolderFileStore.js").FolderFileStore} deps.store
   * @param {{allows(sender): Promise<boolean>}} deps.access
   * @param {{isAdmin(sender): Promise<boolean>}} deps.admins
   * @param {import("./Listings.js").Listings} deps.listings the numbered lists shown per chat (shared with the Administrator)
   * @param {import("./UnknownCommands.js").UnknownCommands} deps.unknown counts the slash-words nobody understood
   * @param {import("../ethics/Citations.js").Citations} [deps.citations] for the quotation that opens the /spinoza help
   * @param {import("../i18n/en.js").en} deps.replies texts in the configured language
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {number} [deps.maxFilesPerRequest]
   * @param {number} [deps.maxReplyChars]
   */
  constructor({gateway, store, outbox = null, access, admins, listings, unknown, citations = null, replies, logger, maxFilesPerRequest = 3, maxReplyChars = 3500}) {
    this.outbox = outbox // files go out as copies, so the CLI never deletes an archived original
    this.gateway = gateway
    this.store = store
    this.access = access
    this.admins = admins
    this.listings = listings
    this.unknown = unknown
    this.citations = citations
    this.replies = replies
    this.logger = logger
    this.maxFilesPerRequest = maxFilesPerRequest
    this.maxReplyChars = maxReplyChars
  }

  /** @param {import("../domain/Message.js").Message} message */
  async handle(message) {
    if (!message.isDirect || !message.incoming) return
    const command = resolveSection(parseCommand(message.text))
    const isMember = await this.access.allows(message.sender)
    if (!isMember && (command.kind === CommandKind.LIST || command.kind === CommandKind.GET || command.kind === CommandKind.FILES_HELP)) {
      this.logger.info(`denied ${message.sender.name}: not a group member`)
      await this.gateway.sendText(message.chat, this.replies.deniedText())
      return
    }
    // never log the text of unrecognised messages: it may be a mistyped secret or private chatter
    this.logger.info(`${message.sender.name}: ${command.kind}${command.kind !== CommandKind.UNKNOWN && command.argument ? ` ${command.argument}` : ""}`)
    switch (command.kind) {
      case CommandKind.LIST:
        return this.#list(message.chat, command.argument)
      case CommandKind.GET:
        return this.#get(message.chat, command.argument)
      case CommandKind.FILES_HELP:
        return this.gateway.sendText(message.chat, this.replies.filesHelpText())
      case CommandKind.SPINOZA:
        if (isMember) return this.gateway.sendText(message.chat, this.replies.spinozaHelpText(this.citations?.next() ?? null))
      // falls through: a stranger gets the limited help
      default: {
        if (command.kind === CommandKind.UNKNOWN && /^\/\S/.test(message.text.trim())) return this.#unknownCommand(message)
        const full = command.kind === CommandKind.HELP && /^(all|full|все|всё|полная|полный)$/iu.test(command.argument)
        return this.gateway.sendText(message.chat, this.replies.withQuotationText(this.citations?.next() ?? null, this.replies.helpText(isMember && (await this.admins.isAdmin(message.sender)), isMember, full)))
      }
    }
  }

  describe() {
    return `serving files to ${this.access.describe()}`
  }

  /** A slash-word nobody understands: say so, suggest the nearest command, count it for /status. Only the word is logged. */
  async #unknownCommand(message) {
    const word = message.text.trim().split(/\s+/)[0]
    this.unknown.record(word)
    this.logger.info(`${message.sender.name}: unknown command ${word}`)
    await this.gateway.sendText(message.chat, this.replies.unknownCommandText(word, suggestCommand(word)))
  }

  /** Newest first: for archived files the modification time is when they were saved. */
  #sorted(pattern) {
    return this.store.list(pattern).sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name))
  }

  async #list(chat, pattern) {
    const files = this.#sorted(pattern)
    if (files.length > 0) this.listings.remember("archive", chat.id, files.map((f) => f.name)) // an empty filter must not steal the numbers
    await this.gateway.sendText(chat, this.replies.listText(files, pattern, this.maxReplyChars))
  }

  /** A number refers to the last listing shown in this chat (or to the current one); otherwise a name or a pattern. */
  async #get(chat, query) {
    if (!query) return this.gateway.sendText(chat, this.replies.getUsageText())
    const matches = /^\d+$/.test(query) && this.store.exact(query).length === 0 ? await this.#numbered(chat, Number(query)) : this.store.find(query)
    if (matches === null) return
    if (matches.length === 0) return this.gateway.sendText(chat, this.replies.notFoundText(query))
    if (matches.length > this.maxFilesPerRequest) {
      // too many for one answer: number them so the person can pick with "/get <number>"
      const candidates = matches.sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name))
      this.listings.remember("archive", chat.id, candidates.map((f) => f.name))
      return this.gateway.sendText(chat, this.replies.tooManyText(query, candidates.map((f) => f.name), this.maxReplyChars))
    }
    for (const file of matches) {
      try {
        await sendThrough(this.outbox, this.store.pathOf(file.name), (copy) => this.gateway.sendFile(chat, copy))
        this.logger.info(`sending ${file.name} to ${chat.name}`)
      } catch (e) {
        this.logger.warn(`failed to send ${file.name} to ${chat.name}: ${e.message}`)
        await this.gateway.sendText(chat, this.replies.sendFailedText(file.name))
      }
    }
  }

  /** @returns {object[]|null} the file with that number in the last listing, [] if it is gone, null after replying that the number is out of range */
  async #numbered(chat, number) {
    const {name, count} = this.listings.resolve("archive", chat.id, number, this.#sorted().map((f) => f.name))
    if (!name) {
      await this.gateway.sendText(chat, this.replies.noSuchNumberText(number, count))
      return null
    }
    return this.store.list().filter((f) => f.name === name)
  }
}
