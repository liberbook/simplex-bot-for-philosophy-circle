import {ADMIN_COMMANDS, CommandKind, MAINTENANCE_COMMANDS, parseCommand, resolveSection} from "../domain/Command.js"
import {detachFile, reattachFile} from "./Curator.js"
import {isActive} from "../domain/ClassCalendar.js"
import {RateLimiter} from "./RateLimiter.js"

/**
 * Private-chat behaviour for keeping the archive and running the bot. Members
 * of the served group move files to / from the deleted folder and get storage
 * and status reports; admins additionally hand out invitations, make the bot
 * join groups and manage admins; anyone may become admin with the secret
 * (with a lockout after repeated wrong secrets).
 */
export class Administrator {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("../storage/FolderFileStore.js").FolderFileStore} deps.store the archive
   * @param {import("../storage/FolderFileStore.js").FolderFileStore} deps.deleted the deleted folder
   * @param {{allows(sender): Promise<boolean>}} deps.access who may use the maintenance commands (members)
   * @param {import("./Listings.js").Listings} deps.listings the numbered lists shown per chat ("/list", "/deleted")
   * @param {import("./UnknownCommands.js").UnknownCommands} [deps.unknown] for the statistics in /status
   * @param {import("./AdminPolicy.js").AdminPolicy} deps.admins
   * @param {import("./StorageQuota.js").StorageQuota} deps.quota
   * @param {import("./WatchedGroups.js").WatchedGroups} deps.groups
   * @param {import("../i18n/en.js").en} deps.replies texts in the configured language
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {import("./RateLimiter.js").RateLimiter} [deps.adminAttempts] wrong-secret limiter (5 per hour per contact)
   * @param {number} [deps.retentionMs] how long deleted files are kept; 0 = forever
   * @param {{version: string, startedAt: number}} [deps.about] for /status
   * @param {import("../storage/SessionStore.js").SessionStore} [deps.sessions] class cards follow deleted / restored files; the schedule in /status
   * @param {() => number} [deps.clock]
   */
  constructor({
    gateway,
    store,
    deleted,
    access,
    listings,
    unknown = null,
    admins,
    quota,
    groups,
    replies,
    logger,
    adminAttempts = new RateLimiter({limit: 5, windowMs: 3_600_000}),
    retentionMs = 30 * 24 * 3_600_000,
    about = {version: "dev", startedAt: Date.now()},
    sessions = null,
    clock = () => Date.now(),
    maxCandidates = 10,
    maxReplyChars = 3500,
  }) {
    this.gateway = gateway
    this.store = store
    this.deleted = deleted
    this.access = access
    this.listings = listings
    this.unknown = unknown
    this.admins = admins
    this.quota = quota
    this.groups = groups
    this.replies = replies
    this.logger = logger
    this.adminAttempts = adminAttempts
    this.retentionMs = retentionMs
    this.about = about
    this.sessions = sessions
    this.clock = clock
    this.maxCandidates = maxCandidates
    this.maxReplyChars = maxReplyChars
  }

  /**
   * @param {import("../domain/Message.js").Message} message
   * @returns {Promise<boolean>} true if the message was a maintenance or admin command (handled here)
   */
  async handle(message) {
    if (!message.isDirect || !message.incoming) return false
    const command = resolveSection(parseCommand(message.text))
    const isAdminCommand = ADMIN_COMMANDS.has(command.kind)
    if (!isAdminCommand && !MAINTENANCE_COMMANDS.has(command.kind)) return false
    const {chat, sender} = message
    if (command.kind === CommandKind.ADMIN) {
      await this.#promote(chat, sender, command.argument)
      return true
    }
    if (isAdminCommand && !(await this.admins.isAdmin(sender))) {
      this.logger.info(`refused ${command.kind} from ${sender.name}: not an admin`)
      await this.gateway.sendText(chat, this.replies.adminsOnlyText())
      return true
    }
    if (!isAdminCommand && !(await this.access.allows(sender))) {
      this.logger.info(`denied ${command.kind} from ${sender.name}: not a group member`)
      await this.gateway.sendText(chat, this.replies.deniedText())
      return true
    }
    this.logger.info(`${sender.name}${isAdminCommand ? " (admin)" : ""}: ${command.kind}${command.argument ? ` ${command.argument}` : ""}`)
    switch (command.kind) {
      case CommandKind.DELETE:
        await this.#move(chat, command.argument, this.store, this.deleted, "delete")
        this.purgeDeleted()
        break
      case CommandKind.RESTORE:
        await this.#move(chat, command.argument, this.deleted, this.store, "restore")
        break
      case CommandKind.DELETED: {
        this.purgeDeleted()
        const files = this.deleted.list().sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name))
        this.listings.remember("deleted", chat.id, files.map((f) => f.name))
        await this.gateway.sendText(chat, this.replies.deletedListText(files, this.maxReplyChars))
        break
      }
      case CommandKind.SPACE:
        await this.gateway.sendText(chat, this.replies.spaceText(this.quota.usage(), this.#deletedSummary()))
        break
      case CommandKind.STATUS:
        await this.gateway.sendText(chat, this.replies.statusText(await this.#status()))
        break
      case CommandKind.ADMINS:
        await this.gateway.sendText(chat, this.replies.adminsListText(this.admins.registry.list()))
        break
      case CommandKind.UNADMIN:
        await this.#unadmin(chat, command.argument)
        break
      case CommandKind.INVITE:
        await this.gateway.sendText(chat, this.replies.inviteText(await this.gateway.createInvitation()))
        break
      case CommandKind.JOIN:
        await this.#join(chat, command.argument)
        break
    }
    return true
  }

  /** Removes files that have been in the deleted folder longer than the retention period. */
  purgeDeleted() {
    if (this.retentionMs <= 0) return []
    const removed = this.deleted.purgeOlderThan(this.retentionMs, this.clock())
    if (removed.length > 0) this.logger.info(`purged from the deleted folder: ${removed.join(", ")}`)
    this.sessions?.forgetDeletedFiles(removed)
    return removed
  }

  async #promote(chat, sender, secret) {
    const key = sender.contactId ?? chat.id
    if (this.adminAttempts.isLimited(key)) {
      const verdict = this.adminAttempts.hit(key)
      this.logger.warn(`ignored admin attempt by ${sender.name}: too many wrong secrets`)
      if (verdict === "limit") await this.gateway.sendText(chat, this.replies.adminLockedText())
      return
    }
    const outcome = this.admins.promote({contactId: sender.contactId, name: sender.name}, secret)
    this.logger.info(`${sender.name} requested admin access: ${outcome}`)
    if (outcome === "wrong-secret" && this.adminAttempts.hit(key) === "limit") {
      await this.gateway.sendText(chat, this.replies.adminLockedText())
      return
    }
    if (outcome === "granted") this.adminAttempts.reset(key)
    await this.gateway.sendText(chat, this.replies.promotionText(outcome, sender.name))
  }

  /**
   * Moves exactly one file between the archive and the deleted folder. The
   * argument is the file's number in the list last shown here (/list for
   * delete, /deleted for restore) or its exact name: patterns and ambiguous
   * names are refused with the candidates listed.
   */
  async #move(chat, query, from, to, action) {
    const t = this.replies
    if (!query) return this.gateway.sendText(chat, action === "delete" ? t.deleteUsageText() : t.restoreUsageText())
    if (/^\d+$/.test(query) && from.exact(query).length === 0) {
      const current = from.list().sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name)).map((f) => f.name)
      const {name, count} = this.listings.resolve(action === "delete" ? "archive" : "deleted", chat.id, Number(query), current)
      if (!name) return this.gateway.sendText(chat, t.noSuchNumberText(Number(query), count))
      query = name
    }
    const exact = from.exact(query)
    if (exact.length === 1) {
      const storedAs = from.moveTo(exact[0].name, to, new Date(this.clock()))
      this.logger.info(`${action}d ${exact[0].name}${storedAs !== exact[0].name ? ` as ${storedAs}` : ""} (by ${chat.name})`)
      const classDate = this.#syncClassCard(action, exact[0].name, storedAs)
      if (action === "restore") return this.gateway.sendText(chat, t.restoredText(exact[0].name, storedAs, {classDate}))
      // the deleted folder, newest first, is the list "/restore <number>" now refers to - the file just deleted is number 1
      const deletedNow = this.deleted.list().sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name)).map((f) => f.name)
      this.listings.remember("deleted", chat.id, deletedNow)
      return this.gateway.sendText(chat, t.deletedText(exact[0].name, storedAs, {classDate, number: Math.max(1, deletedNow.indexOf(storedAs) + 1)}))
    }
    const candidates = (exact.length > 1 ? exact : from.find(query)).sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name))
    if (candidates.length === 0) return this.gateway.sendText(chat, action === "delete" ? t.notFoundText(query) : t.deletedNotFoundText(query))
    // several files: number them so "/delete 2" (or "/restore 2") can follow
    this.listings.remember(action === "delete" ? "archive" : "deleted", chat.id, candidates.map((f) => f.name))
    await this.gateway.sendText(chat, t.ambiguousNameText(query, candidates.slice(0, this.maxCandidates).map((f) => f.name), candidates.length, action))
  }

  /**
   * A class card only lists files that are in the archive: a deleted file leaves it (remembered
   * under its name in the deleted folder), a restored one returns to the card it left.
   * @returns {string|null} the date of the class whose card changed
   */
  #syncClassCard(action, name, storedAs) {
    if (!this.sessions) return null
    const session = action === "delete" ? this.sessions.findByFile(name) : this.sessions.findByDeletedFile(name)
    if (!session) return null
    const changed = action === "delete" ? detachFile(session, name, storedAs) : reattachFile(session, name, storedAs)
    if (changed) this.sessions.save(session, new Date(this.clock()))
    return session.date
  }

  async #unadmin(chat, name) {
    if (!name) return this.gateway.sendText(chat, this.replies.unadminUsageText())
    const admin = this.admins.registry.list().find((a) => a.name.toLowerCase() === name.toLowerCase())
    if (!admin) return this.gateway.sendText(chat, this.replies.unadminNotFoundText(name))
    this.admins.registry.remove(admin.contactId)
    this.logger.info(`admin removed: ${admin.name} (by ${chat.name})`)
    await this.gateway.sendText(chat, this.replies.unadminDoneText(admin.name))
  }

  async #join(chat, link) {
    if (!link) return this.gateway.sendText(chat, this.replies.joinUsageText())
    try {
      const result = await this.gateway.joinGroupLink(link)
      const matches = result.title === null || this.groups.matches({name: result.title, title: result.title})
      this.logger.info(`join via link: ${result.status}${result.title ? ` "${result.title}"` : ""}${matches ? "" : " (does not match the group pattern)"}`)
      await this.gateway.sendText(chat, this.replies.joiningText(result, this.groups.pattern, matches))
    } catch (e) {
      this.logger.warn(`connect via link failed: ${e.message}`)
      await this.gateway.sendText(chat, this.replies.joinFailedText(e.message))
    }
  }

  #deletedSummary() {
    const files = this.deleted.list()
    return {count: files.length, bytes: files.reduce((sum, f) => sum + f.size, 0), retentionMs: this.retentionMs}
  }

  async #status() {
    return {
      name: (await this.gateway.activeUser())?.name ?? "bot",
      version: this.about.version,
      uptimeMs: this.clock() - this.about.startedAt,
      groups: await this.groups.list(),
      fileCount: this.store.list().length,
      usage: this.quota.usage(),
      deleted: this.#deletedSummary(),
      schedule: this.sessions?.getSchedule() ?? null,
      classCount: this.sessions?.list().filter(isActive).length ?? 0,
      unknownCommands: this.unknown?.top(5) ?? [],
    }
  }
}
