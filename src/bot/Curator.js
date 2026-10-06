import path from "node:path"
import {CommandKind, parseGroupCommand, resolveClassCommand} from "../domain/Command.js"
import {fileKind, isAudio, newSession, parseAnnouncement, parseDate, resolveClassDate, todayFor} from "../domain/Session.js"
import {isAcceptable} from "../domain/Message.js"
import {classCard, nextClass} from "../domain/ClassCalendar.js"
import {RateLimiter} from "./RateLimiter.js"

/**
 * Group-side behaviour for classes: records announcements marked with
 * "/занятие" (as a post or as a reply to a post), keeps their text current
 * when edited, puts their attachments on the class card (a reference to the
 * archive file - the archive stays flat), and links a recording marked "prius"
 * ("/last") with the class it belongs to.
 */
export class Curator {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("./Archivist.js").Archivist} deps.archivist downloads files (claimed for a class here)
   * @param {import("../storage/FolderFileStore.js").FolderFileStore} deps.store the archive (to find files the bot already has)
   * @param {import("../storage/SessionStore.js").SessionStore} deps.sessions
   * @param {import("./Notifier.js").Notifier} deps.notifier
   * @param {import("./ScheduleDesk.js").ScheduleDesk} deps.scheduleDesk the /schedule command (shared with the private side)
   * @param {import("./WatchedGroups.js").WatchedGroups} deps.groups
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {() => Date} [deps.clock]
   */
  constructor({gateway, archivist, store, sessions, notifier, scheduleDesk, groups, replies, logger, clock = () => new Date(), lookback = 20, limiter = new RateLimiter({limit: 10, windowMs: 10 * 60_000})}) {
    this.gateway = gateway
    this.archivist = archivist
    this.store = store
    this.lookback = lookback
    this.sessions = sessions
    this.notifier = notifier
    this.scheduleDesk = scheduleDesk
    this.groups = groups
    this.replies = replies
    this.logger = logger
    this.clock = clock
    this.limiter = limiter
    this.pendingFiles = new Map() // fileId -> {date, kind, author}
  }

  /** @param {import("../domain/Message.js").Message} message a live group message */
  async handle(message) {
    if (!message.isGroup || !message.incoming || !this.groups.matches(message.chat)) return
    const command = parseGroupCommand(message.text)
    if (command.kind === CommandKind.SCHEDULE) return this.gateway.sendText(message.chat, this.scheduleDesk.brief({changeAsked: command.argument !== ""})) // the group only sees it; changes are made privately
    if (command.kind === CommandKind.SESSION) {
      // "/занятие перенос ..." typed in the group is a private operation, not a class post: say so and change nothing
      if (resolveClassCommand(command).kind !== CommandKind.HOMEWORK) return this.gateway.sendText(message.chat, this.replies.privateOnlyText(), {}, message.itemId)
      return this.#announce(message, command.words)
    }
    if (command.kind === CommandKind.LAST) return this.#last(message, command.argument)
    // a plain file (a recording included) is not the curator's business unless it answers a class post
    if (!message.hasFile || message.quotedItemId === null) return
    const session = this.sessions.findByPost(message.chat.id, message.quotedItemId)
    if (session) await this.#attachFile(session, message.file, message, {announce: true})
  }

  /** An edited group message: keep the class's text current. */
  async handleUpdate(message) {
    if (!message.isGroup || !message.incoming) return
    const session = this.sessions.findByPost(message.chat.id, message.itemId)
    if (!session) return
    const post = session.posts.find((p) => p.itemId === message.itemId)
    const command = parseGroupCommand(message.text)
    const {topic, text} = command.kind === CommandKind.SESSION ? parseAnnouncement(message.text, this.clock(), command.words, todayFor(this.sessions.getSchedule(), this.clock())) : {topic: null, text: message.text}
    if (post.text === text && (!topic || topic === session.topic)) return
    post.text = text
    post.editedAt = this.clock().toISOString()
    if (topic) session.topic = topic
    this.sessions.save(session, this.clock())
    this.logger.info(`class ${session.date}: post ${post.itemId} edited by ${message.sender.name}`)
    this.notifier.changed(session.date, {kind: "edit", by: message.sender.name})
  }

  /**
   * A post was deleted for everyone: drop its text from the class card; its file (now in the
   * deleted folder as `removed.storedAs`) leaves the card but stays restorable to it.
   * @param {{name: string, storedAs: string}|null} removed what the Archivist moved to the deleted folder
   */
  onMessageDeleted(message, removed = null) {
    const session = this.sessions.findByPost(message.chat.id, message.itemId) ?? (removed ? this.sessions.findByFile(removed.name) : null)
    if (!session) return
    const before = session.posts.length + session.files.length
    session.posts = session.posts.filter((p) => p.itemId !== message.itemId)
    if (removed) detachFile(session, removed.name, removed.storedAs)
    if (session.posts.length + session.files.length === before) return
    this.sessions.save(session, this.clock())
    this.logger.info(`class ${session.date}: post ${message.itemId} deleted by its author or a moderator - card updated`)
  }

  /** A file the Archivist finished saving that a class claimed: on the card now. */
  onFileStored(fileId, storedAs) {
    const pending = this.pendingFiles.get(fileId)
    if (!pending) return
    this.pendingFiles.delete(fileId)
    const session = this.sessions.get(pending.date)
    if (!session) return
    session.files.push({name: storedAs, kind: pending.kind, addedAt: this.clock().toISOString(), author: pending.author})
    this.sessions.save(session, this.clock())
    this.logger.info(`class ${session.date}: ${pending.kind} ${storedAs} added`)
    this.notifier.changed(session.date, {kind: pending.kind === "audio" ? "audio" : "file", by: pending.author, name: storedAs})
  }

  describe() {
    const schedule = this.sessions.getSchedule()
    return schedule ? `classes: ${this.replies.scheduleText(schedule)}` : "classes: no schedule yet"
  }

  /** Class commands in the group are rate-limited per member. */
  #allowed(message) {
    return this.limiter.hit(`${message.chat.id}:${message.sender.memberId ?? message.sender.name}`) === "ok"
  }

  /**
   * "/class [date] [topic]" as a post, as a reply attaching the quoted post, or
   * as a comment right after a post (the apps' comments reach the CLI without
   * a link, so a bare command refers to the latest post before it).
   */
  async #announce(message, commandWords = 1) {
    if (!this.#allowed(message)) return
    const now = this.clock()
    const schedule = this.sessions.getSchedule()
    const {date: explicitDate, topic, text} = parseAnnouncement(message.text, now, commandWords, todayFor(schedule, now))
    let quoted = message.quotedItemId !== null ? await this.gateway.messageById(message.chat.id, message.quotedItemId) : null
    if (!quoted && !message.hasFile && !text) quoted = await this.#previousPost(message)
    // "/spinoza занятие" alone with nothing to tie: show the next class instead of recording an empty one
    if (!quoted && !message.hasFile && !text && !topic && !explicitDate) return this.#showNext(message.chat, schedule, now)
    const source = quoted ?? message // the post whose text and file define the class
    const file = source.file ?? (quoted ? message.file : null)
    const date = resolveClassDate({schedule, sessions: this.sessions.list(), now, explicitDate, audio: quoted ? isAudio(file) : false})
    if (!date) return this.gateway.sendText(message.chat, this.replies.recordingNeedsDateText())

    const session = this.sessions.get(date) ?? newSession(date, now)
    if (topic) session.topic = topic
    const postText = quoted ? quoted.text : text
    if (postText || !file) {
      const existing = session.posts.find((p) => p.itemId === source.itemId)
      if (!existing) session.posts.push({itemId: source.itemId, groupId: message.chat.id, author: source.sender.name, text: postText, sentAt: (source.sentAt ?? now).toISOString(), editedAt: null})
      else existing.text = postText
    }
    this.sessions.save(session, now)
    this.logger.info(`class ${date}: ${quoted ? "post attached" : "announced"} by ${message.sender.name}`)
    this.notifier.changed(date, {kind: "post", by: message.sender.name})
    if (file) await this.#attachFile(session, file, source.file ? source : message, {announce: false})
    await this.gateway.sendText(message.chat, this.replies.postTiedText(date, session.time ?? schedule?.time ?? null))
  }

  /** The card of the next class, in the group (no private commands in its footer). */
  async #showNext(chat, schedule, now) {
    const sessions = this.sessions.list()
    const next = nextClass({schedule, sessions, now})
    if (!next) return this.gateway.sendText(chat, this.scheduleDesk.brief())
    await this.gateway.sendText(chat, this.replies.classCardText(classCard({schedule, sessions, now, date: next.date, session: next.session}), {footer: false}))
  }

  /** The latest ordinary post (text or file, not a command, not ours) before `message`. */
  async #previousPost(message) {
    const recent = await this.gateway.recentMessages(message.chat.id, this.lookback)
    return recent.filter((m) => m.incoming && m.itemId < message.itemId && (m.hasFile || m.text) && parseGroupCommand(m.text).kind === CommandKind.UNKNOWN).at(-1) ?? null
  }

  /**
   * "prius [date]" ("/last") in a file's caption, as a reply to a file or as a comment
   * right after it: the file (typically the recording) belongs to the last
   * class - the most recent one by the schedule if it was within a week, or
   * the given date.
   */
  async #last(message, argument) {
    const now = this.clock()
    const schedule = this.sessions.getSchedule()
    const explicitDate = argument ? parseDate(argument, now, todayFor(schedule, now)) : null
    if (argument && !explicitDate) return this.logger.debug(`"prius ${argument.slice(0, 30)}" is a sentence, not a marker - ignored`) // "prius est …" is Latin talk
    if (!this.#allowed(message)) return
    const source = await this.#fileSource(message)
    if (!source) return this.gateway.sendText(message.chat, this.replies.noFileText("prius"))
    const date = resolveClassDate({schedule, sessions: this.sessions.list(), now, explicitDate, audio: true})
    if (!date) return this.gateway.sendText(message.chat, this.replies.recordingNeedsDateText())
    const session = this.sessions.get(date) ?? this.sessions.save(newSession(date, now), now)
    await this.#attachFile(session, source.file, source, {announce: true})
  }

  /** The message whose file a "prius" refers to: itself, the quoted one, or the latest file posted before it. */
  async #fileSource(message) {
    if (message.hasFile) return message
    if (message.quotedItemId !== null) {
      const quoted = await this.gateway.messageById(message.chat.id, message.quotedItemId)
      return quoted?.hasFile ? quoted : null
    }
    const recent = await this.gateway.recentMessages(message.chat.id, this.lookback)
    return recent.filter((m) => m.hasFile && m.incoming && m.itemId < message.itemId).at(-1) ?? null
  }

  /**
   * A fresh offer is downloaded and claimed for the class; a download in flight
   * is claimed too; a file the bot already has (kept when it was posted, or on
   * another class's card) is simply referenced. Anything else is reported.
   */
  async #attachFile(session, file, cause, {announce}) {
    const kind = fileKind(file)
    if (!isAcceptable(file) && !this.archivist.isDownloading(file.id)) {
      const archived = this.store.exact(path.basename(file.path ?? file.name))[0]
      if (archived) return this.#linkSavedFile(session, archived, kind, cause, announce)
    }
    this.pendingFiles.set(file.id, {date: session.date, kind, author: cause.sender.name})
    const saving = await this.archivist.save(file, cause, {claim: true})
    if (!saving.ok) {
      this.pendingFiles.delete(file.id)
      this.logger.warn(`cannot attach ${file.name} to class ${session.date}: ${saving.reason}`)
      await this.gateway.sendText(cause.chat, saving.reason === "full" || saving.reason === "unsafe" ? this.replies.attachRefusedText(file.name, saving.reason) : this.replies.attachFailedText(file.name))
      return
    }
    if (announce) await this.#announceAttached(session, file.name, cause)
  }

  /** One line in the group: the file is with its class now (a recording and a reading alike). */
  #announceAttached(session, name, cause) {
    return this.gateway.sendText(cause.chat, this.replies.savedToClassText(session.date, name))
  }

  /** A file the bot already has is put on the card - a file belongs to one class at a time. */
  async #linkSavedFile(session, archived, kind, cause, announce) {
    const name = archived.name
    const other = this.sessions.findByFile(name)
    if (other && other.date !== session.date) {
      other.files = other.files.filter((f) => f.name !== name)
      this.sessions.save(other, this.clock())
    }
    if (!session.files.some((f) => f.name === name)) {
      session.files.push({name, kind, addedAt: this.clock().toISOString(), author: cause.sender.name})
      this.sessions.save(session, this.clock())
      this.logger.info(`class ${session.date}: ${kind} ${name} linked${other && other.date !== session.date ? ` (was with class ${other.date})` : " from the archive"}`)
      this.notifier.changed(session.date, {kind: kind === "audio" ? "audio" : "file", by: cause.sender.name, name})
    }
    if (announce) await this.#announceAttached(session, name, cause)
  }
}

/** Takes the reference `name` off the card, remembering it (as `storedAs`, its name in the deleted folder) for /restore. */
export function detachFile(session, name, storedAs = name) {
  const file = session.files.find((f) => f.name === name)
  if (!file) return false
  session.files = session.files.filter((f) => f !== file)
  session.deletedFiles = [...session.deletedFiles.filter((f) => f.name !== storedAs), {...file, name: storedAs}]
  return true
}

/** The reverse of detachFile: a restored file (`name` in the deleted folder, `storedAs` in the archive now) returns to the card. */
export function reattachFile(session, name, storedAs = name) {
  const file = session.deletedFiles.find((f) => f.name === name)
  if (!file) return false
  session.deletedFiles = session.deletedFiles.filter((f) => f !== file)
  if (!session.files.some((f) => f.name === storedAs)) session.files.push({...file, name: storedAs})
  return true
}
