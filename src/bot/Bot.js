import fs from "node:fs"
import path from "node:path"

const SETUP_RETRY_MS = 5_000
/** Events held while start-up configuration runs; older ones are dropped beyond this. */
const MAX_BACKLOG = 1000
/** Copies in the outbox whose upload never finished are dropped after this long. */
const OUTBOX_MAX_AGE_MS = 24 * 3_600_000

/**
 * Orchestrator: connects the gateway, performs start-up configuration and
 * routes domain events to the Archivist (group side) and Librarian (private
 * side). Contains no chat logic of its own.
 */
export class Bot {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("./Archivist.js").Archivist} deps.archivist
   * @param {import("./Courier.js").Courier} [deps.courier] the fetch word: a group file sent privately
   * @param {import("../storage/Outbox.js").Outbox} [deps.outbox] copies of the files being sent: released after the upload
   * @param {import("./Librarian.js").Librarian} deps.librarian
   * @param {import("./Administrator.js").Administrator} deps.administrator
   * @param {import("./GroupDesk.js").GroupDesk} deps.groupDesk
   * @param {import("./Philosopher.js").Philosopher} deps.philosopher
   * @param {import("./Greeter.js").Greeter} deps.greeter greets new private contacts
   * @param {import("./ContactBook.js").ContactBook} [deps.contacts] removes contacts whose other side is gone
   * @param {import("./Throttle.js").Throttle} deps.throttle
   * @param {import("./Curator.js").Curator} deps.curator group side of classes
   * @param {import("./Syllabus.js").Syllabus} deps.syllabus private side of classes
   * @param {import("./ConfirmDesk.js").ConfirmDesk} [deps.confirmDesk] "/подтвердить" and "/отменить" for every previewed action
   * @param {import("./Reminder.js").Reminder} [deps.reminder] "the class starts soon" in the groups
   * @param {import("./PollDesk.js").PollDesk} [deps.pollDesk] private side of polls
   * @param {import("./PollBoard.js").PollBoard} [deps.pollBoard] group side of polls (reactions, deadlines)
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("./AdminPolicy.js").AdminPolicy} deps.admins
   * @param {import("./WatchedGroups.js").WatchedGroups} deps.groups
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {{filesDir: string, stateDir: string, scanCount: number, publicAddress: boolean, groupLinks?: string[], avatarFile?: string|null}} deps.options
   */
  constructor({gateway, archivist, courier = null, outbox = null, librarian, administrator, groupDesk, philosopher, greeter, contacts = null, throttle, curator, syllabus, confirmDesk = null, reminder = null, pollDesk = null, pollBoard = null, replies, admins, groups, logger, options}) {
    this.gateway = gateway
    this.confirmDesk = confirmDesk
    this.greeter = greeter
    this.contacts = contacts
    this.reminder = reminder
    this.pollDesk = pollDesk
    this.pollBoard = pollBoard
    this.philosopher = philosopher
    this.throttle = throttle
    this.curator = curator
    this.syllabus = syllabus
    this.replies = replies
    this.archivist = archivist
    this.courier = courier
    this.outbox = outbox
    this.librarian = librarian
    this.administrator = administrator
    this.groupDesk = groupDesk
    this.admins = admins
    this.groups = groups
    this.logger = logger
    this.options = options
    this.ready = false
    this.backlog = []
    this.connectionNo = 0
  }

  /** Resolves once connected and configured; keeps running until stop(). */
  async run() {
    this.gateway.onEvent((event) => this.#dispatch(event))
    this.gateway.onOpen(() => this.#setupWithRetry(++this.connectionNo))
    await this.gateway.start()
  }

  stop() {
    this.reminder?.stop()
    this.pollBoard?.stop()
    this.gateway.stop()
  }

  /** Start-up configuration can fail transiently (e.g. CLI still migrating); retry while this connection lasts. */
  async #setupWithRetry(connectionNo) {
    for (;;) {
      try {
        await this.#setup()
        return
      } catch (e) {
        this.logger.error(`setup failed: ${e.message} - retrying in ${SETUP_RETRY_MS / 1000}s`)
        await new Promise((r) => setTimeout(r, SETUP_RETRY_MS))
        if (connectionNo !== this.connectionNo) return // reconnected meanwhile; a new setup is running
      }
    }
  }

  async #setup() {
    // The CLI starts delivering queued events as soon as we connect; hold
    // them until the files folder and profile are configured.
    this.ready = false
    this.backlog = []

    const user = await this.gateway.activeUser()
    if (!user) throw new Error('no active profile - start the CLI with --create-bot-display-name <name> --create-bot-allow-files')
    this.logger.info(`profile: ${user.name}`)

    await this.gateway.setFilesFolder(this.options.filesDir)
    await this.gateway.setBotCommands(this.replies.botCommandsSpec)
    await this.gateway.acceptMemberContacts()
    await this.#setAvatar(user.image)
    await this.#publishContactLinks()

    await this.#joinConfiguredGroups()
    const groups = await this.groups.list()
    this.logger.info(groups.length > 0 ? `watching: ${groups.map((g) => `#${g.name}`).join(", ")}` : `no joined group matches "${this.groups.pattern}" yet - will join when invited`)
    this.logger.info(`${this.archivist.describe()}; ${this.librarian.describe()}; ${this.admins.describe()}; ${this.throttle.describe()}; ${this.curator.describe()}${this.reminder ? `; ${this.reminder.describe()}` : ""}`)

    await this.archivist.scan(this.options.scanCount)
    this.administrator.purgeDeleted()
    this.outbox?.purgeOlderThan(OUTBOX_MAX_AGE_MS)
    if (this.contacts) {
      const removed = await this.contacts.cleanup().catch((e) => (this.logger.warn(`contact cleanup failed: ${e.message}`), 0))
      if (removed > 0) this.logger.info(`removed ${removed} contact(s) whose other side is gone`)
    }

    this.ready = true
    const backlog = this.backlog
    this.backlog = []
    for (const event of backlog) this.#dispatch(event)
    this.reminder?.start() // idempotent: a reconnect re-plans
    await this.pollBoard?.start()
    this.logger.info("ready")
  }

  /**
   * Files in replayed history are still worth keeping; commands and requests in
   * it are not worth answering (e.g. a "/spinoza" from before the bot joined).
   */
  async #routeMessage(message) {
    if (message.isGroup) {
      if (message.isReplayed) {
        this.logger.debug(`ignoring command in replayed group message from ${message.sender.name}: "${message.text.slice(0, 40)}"`)
      } else {
        await this.curator.handle(message) // first: it claims a class's files before the Archivist sees them
        await this.groupDesk.handle(message)
      }
      await this.archivist.handle(message)
      if (!message.isReplayed) await this.courier?.handle(message)
      return
    }
    if (await this.throttle.handle(message)) return
    if (await this.administrator.handle(message)) return
    if (this.confirmDesk && (await this.confirmDesk.handle(message))) return
    if (this.pollDesk && (await this.pollDesk.handle(message))) return
    if (!(await this.syllabus.handle(message)) && !(await this.philosopher.handle(message))) await this.librarian.handle(message)
  }

  /** Profile picture from options.avatarFile (png/jpg), set only when it differs from the current one. */
  async #setAvatar(currentImage) {
    const file = this.options.avatarFile
    if (!file) return
    let dataUri
    try {
      const type = /\.jpe?g$/i.test(file) ? "jpg" : "png"
      dataUri = `data:image/${type};base64,${fs.readFileSync(file).toString("base64")}`
    } catch (e) {
      this.logger.warn(`cannot read avatar ${file}: ${e.message}`)
      return
    }
    if (dataUri === currentImage) return
    await this.gateway.setProfileImage(dataUri)
    this.logger.info(`profile picture set from ${path.basename(file)}`)
  }

  /** Group links from the configuration: join the ones the bot is not in yet (idempotent). */
  async #joinConfiguredGroups() {
    for (const link of this.options.groupLinks ?? []) {
      try {
        const result = await this.gateway.joinGroupLink(link)
        if (result.status === "connecting") this.logger.info(`joining ${result.title ? `#${result.title}` : "group"} via configured link`)
        else if (result.status !== "joined") this.logger.warn(`configured group link ignored: ${result.status}`)
      } catch (e) {
        this.logger.warn(`cannot join via configured link ${link.slice(0, 40)}...: ${e.message}`)
      }
    }
  }

  #dispatch(event) {
    if (!this.ready) {
      if (this.backlog.length >= MAX_BACKLOG) this.backlog.shift()
      this.backlog.push(event)
      return
    }
    this.#route(event).catch((e) => this.logger.error(`handling ${event.kind}: ${e.message}`))
  }

  async #route(event) {
    switch (event.kind) {
      case "message":
        await this.#routeMessage(event.message)
        break
      case "messageUpdated":
        await this.curator.handleUpdate(event.message)
        break
      case "messageDeleted":
        this.curator.onMessageDeleted(event.message, this.archivist.onMessageDeleted(event.message))
        break
      case "contactConnected":
        // independent: a failed greeting must not hold back the file the member asked for
        await Promise.allSettled([
          this.greeter.greet(event.contact).catch((e) => this.logger.warn(`cannot greet ${event.contact.name}: ${e.message}`)),
          this.courier?.onContactConnected(event.contact).catch((e) => this.logger.warn(`cannot deliver to ${event.contact.name}: ${e.message}`)),
        ])
        break
      case "contactDeleted":
        await this.contacts?.onContactDeleted(event.contact)
        break
      case "memberContact":
        this.logger.info(`${event.contact.name} from #${event.group.title} opens a private chat`)
        break
      case "groupInvitation":
        if (!this.groups.matches(event.group)) {
          this.logger.info(`ignoring invitation to #${event.group.title} from ${event.from.name}: group name does not match`)
        } else if (!(await this.admins.mayInvite(event.from))) {
          this.logger.warn(`ignoring invitation to #${event.group.title} from ${event.from.name}: not an admin`)
        } else {
          this.logger.info(`joining #${event.group.title} (invited by ${event.from.name})`)
          await this.gateway.joinGroup(event.group.id)
        }
        break
      case "joinedGroup":
        if (this.groups.matches(event.group)) {
          this.logger.info(`joined #${event.group.title} - watching it now`)
          await this.groupDesk.greet(event.group)
        } else {
          this.logger.warn(`joined #${event.group.title}, which does not match the group pattern "${this.groups.pattern}" - not watched`)
        }
        break
      case "fileReceived": {
        const stored = this.archivist.onFileReceived(event.file)
        if (stored) this.curator.onFileStored(stored.file.id, stored.storedAs)
        await this.courier?.onFileReceived(stored)
        break
      }
      case "fileFailed":
        this.archivist.onFileFailed(event.file, event.reason)
        await this.courier?.onFileFailed(event.file)
        break
      case "fileSent":
        this.logger.info(`uploaded: ${event.file?.name}`)
        this.outbox?.release(event.file?.path)
        break
      case "reaction":
        await this.pollBoard?.onReaction(event.reaction)
        break
      case "error":
        this.logger.warn(`CLI reported: ${event.reason}`)
        break
    }
  }

  /**
   * How people reach the bot: a public address (state/address.txt), or - when
   * disabled - a one-time link for the first admin (state/invite.txt) as long
   * as there are no admins yet; admins then hand out links with /invite.
   */
  async #publishContactLinks() {
    if (this.options.publicAddress) {
      const address = await this.gateway.ensureAddress()
      this.logger.info(`bot address: ${address}`)
      this.#writeState("address.txt", address)
    } else if (this.admins.registry.list().length === 0) {
      const link = await this.gateway.createInvitation()
      this.logger.info(`no public address; one-time link for the first admin: ${link}`)
      this.#writeState("invite.txt", link)
    } else {
      this.logger.info("no public address; admins hand out one-time links with /invite")
    }
  }

  #writeState(fileName, content) {
    try {
      fs.mkdirSync(this.options.stateDir, {recursive: true})
      fs.writeFileSync(path.join(this.options.stateDir, fileName), content + "\n")
    } catch (e) {
      this.logger.warn(`cannot write ${fileName}: ${e.message}`)
    }
  }
}
