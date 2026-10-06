import {isAcceptable} from "../domain/Message.js"
import {RateLimiter} from "./RateLimiter.js"
import {memberKey} from "./PrivateLine.js"
import {sendThrough} from "../storage/Outbox.js"

/**
 * The fetch word in the group ("conatus" as a reply to a file, or right after
 * one): the bot posts the file again in the group, as a reply to the request,
 * with one short line saying it is also in the member's private chat - and sends
 * it there. The same file is re-posted in a group at most once per
 * `groupCopyWindowMs` (the copy is right above); the private copy goes every time.
 * A file still downloading is posted and sent once it is saved; a member without a
 * private chat gets one opened (the request names the file) and the file follows
 * when the member accepts it. Pending deliveries live in memory - after a restart
 * the member simply asks again.
 */
export class Courier {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("./Archivist.js").Archivist} deps.archivist finds the requested file, knows where it is
   * @param {import("../storage/FolderFileStore.js").FolderFileStore} deps.store the archive
   * @param {import("./PrivateLine.js").PrivateLine} deps.line opens private chats
   * @param {import("../storage/Outbox.js").Outbox} [deps.outbox] files go out as copies, so the CLI never deletes an archived original
   * @param {import("../i18n/en.js").en} deps.replies texts in the configured language
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {RateLimiter} [deps.limiter] requests per member, default 10 per 10 minutes; beyond it - silence
   * @param {number} [deps.groupCopyWindowMs] a file is re-posted in a group at most once per this window (10 minutes)
   * @param {() => number} [deps.clock] milliseconds now
   */
  constructor({gateway, archivist, store, outbox = null, line, replies, logger, limiter = new RateLimiter({limit: 10, windowMs: 10 * 60_000}), groupCopyWindowMs = 10 * 60_000, clock = () => Date.now()}) {
    this.gateway = gateway
    this.archivist = archivist
    this.store = store
    this.outbox = outbox
    this.line = line
    this.replies = replies
    this.logger = logger
    this.limiter = limiter
    this.awaitingFile = new Map() // fileId -> [{contactId, name}] - the file is still downloading
    this.awaitingContact = new Map() // contactId -> [delivery] - the member has not accepted the private chat yet
    this.awaitingGroup = new Map() // fileId -> [message] - requests whose group copy waits for the download
    this.groupCopies = new Map() // "groupId:fileId" -> when the file was last re-posted there
    this.groupCopyWindowMs = groupCopyWindowMs
    this.clock = clock
  }

  /**
   * @param {import("../domain/Message.js").Message} message
   * @returns {Promise<boolean>} whether it was a request for a file
   */
  async handle(message) {
    const request = await this.archivist.findRequested(message)
    if (!request) return false
    const {sender, chat} = message
    if (this.limiter.hit(memberKey(chat, sender)) !== "ok") {
      this.logger.debug(`ignoring another file request from ${sender.name} in #${chat.name}`)
      return true
    }
    const {file} = request
    // a file the bot has not got yet (posted while it was offline): start the download now
    if (file && this.archivist.locate(file).state === "missing" && isAcceptable(file)) await this.archivist.save(file, message)
    const delivery = file ? {file} : {text: this.replies.whichFileText()}
    this.logger.info(`${sender.name} asks for ${file ? file.name : "a file"} in #${chat.name} - ${file ? "posting it in the group and " : ""}answering privately`)
    if (file) await this.#postInGroup(message, file)
    if (sender.contactId === null || sender.contactId === undefined) return this.#open(message, delivery)
    try {
      await this.#deliver({contactId: sender.contactId, name: sender.name}, delivery)
    } catch (e) {
      const state = await this.line.afterFailure(sender.contactId, sender.name, e)
      if (state === "pending") this.#wait(sender.contactId, delivery)
      else if (state === "gone") await this.#open(message, delivery)
    }
    return true
  }

  /** A download finished: whoever asked for the file while it was coming gets it now. */
  async onFileReceived(stored) {
    if (!stored) return
    for (const request of this.#take(this.awaitingGroup, stored.file.id)) await this.#postInGroup(request, stored.file)
    for (const recipient of this.#take(this.awaitingFile, stored.file.id)) await this.#later(recipient, {file: stored.file})
  }

  /** A download failed: whoever asked for the file is told it is not kept. */
  async onFileFailed(file) {
    if (!file) return
    this.awaitingGroup.delete(file.id) // nothing to post: the requester is told privately
    for (const recipient of this.#take(this.awaitingFile, file.id)) await this.#later(recipient, {text: this.replies.fileNotKeptText(file.name)})
  }

  /** The member accepted the private chat: what they asked for follows. */
  async onContactConnected(contact) {
    const waiting = this.#take(this.awaitingContact, contact.contactId)
    this.logger.debug(`contact ${contact.contactId} (${contact.name}) connected: ${waiting.length} delivery(ies) waiting`)
    for (const delivery of waiting) await this.#later({contactId: contact.contactId, name: contact.name}, delivery)
  }

  /** The contact is gone: nothing waits for it any more. */
  forget(contactId) {
    this.awaitingContact.delete(contactId)
    for (const [fileId, recipients] of this.awaitingFile) {
      const left = recipients.filter((r) => r.contactId !== contactId)
      if (left.length > 0) this.awaitingFile.set(fileId, left)
      else this.awaitingFile.delete(fileId)
    }
  }

  /**
   * The group copy: the kept file again, as a reply to the request, captioned that the
   * requester has it privately too. Waits for a download; skipped for a file no longer
   * kept (the private answer says so) and for a file re-posted in this group a moment ago.
   * A failure here never stops the private delivery.
   */
  async #postInGroup(message, file) {
    const where = this.archivist.locate(file)
    if (where.state === "downloading") return add(this.awaitingGroup, file.id, message)
    if (where.state !== "kept") return
    const key = `${message.chat.id}:${where.name}`
    const now = this.clock()
    if (now - (this.groupCopies.get(key) ?? -Infinity) < this.groupCopyWindowMs) {
      this.logger.debug(`${where.name} was re-posted in #${message.chat.name} a moment ago - not again`)
      return
    }
    try {
      const source = this.store.pathOf(where.name)
      await sendThrough(this.outbox, source, (copy) => this.gateway.sendFile(message.chat, copy, this.replies.fileInGroupText(message.sender.name), message.itemId ?? null))
      this.groupCopies.set(key, now)
      this.logger.info(`re-posted ${where.name} in #${message.chat.name} for ${message.sender.name}`)
    } catch (e) {
      this.logger.warn(`could not re-post ${where.name} in #${message.chat.name}: ${e.message}`)
    }
  }

  /** No usable private chat: open one; its first message says what comes. A one-time link is the only thing ever said in the group. */
  async #open(message, delivery) {
    const opened = await this.line.open(message, delivery.text ?? this.replies.fileComingText(delivery.file.name))
    if (opened.link) {
      await this.gateway.sendText(message.chat, this.replies.spinozaLinkText(opened.link), {}, message.itemId)
      return true
    }
    if (delivery.file) this.#wait(opened.contactId, delivery) // a text request is answered by the first message itself
    return true
  }

  /**
   * Sends what was asked for to a contact believed usable; a file still
   * downloading waits for it, a file gone meanwhile is reported. Throws only
   * when the chat could not be written to.
   */
  async #deliver(recipient, delivery) {
    if (delivery.text) return this.gateway.sendText(direct(recipient), delivery.text)
    const where = this.archivist.locate(delivery.file)
    if (where.state === "downloading") return add(this.awaitingFile, delivery.file.id, recipient)
    let source = null
    try {
      if (where.state === "kept") source = this.store.pathOf(where.name)
    } catch {
      /* deleted between locate() and now */
    }
    if (!source) return this.gateway.sendText(direct(recipient), this.replies.fileNotKeptText(where.name ?? delivery.file.name))
    await sendThrough(this.outbox, source, (copy) => this.gateway.sendFile(direct(recipient), copy))
    this.logger.info(`sent ${where.name} to ${recipient.name} privately`)
  }

  /** A delivery after a wait (download done, chat accepted): a chat not accepted yet keeps it waiting; other failures are logged. */
  async #later(recipient, delivery) {
    try {
      await this.#deliver(recipient, delivery)
    } catch (e) {
      if ((await this.line.afterFailure(recipient.contactId, recipient.name, e)) === "pending") this.#wait(recipient.contactId, delivery)
    }
  }

  #wait(contactId, delivery) {
    this.logger.info(`${delivery.file?.name ?? "an answer"} waits for contact ${contactId} to accept the private chat`)
    add(this.awaitingContact, contactId, delivery)
  }

  #take(map, key) {
    const items = map.get(key) ?? []
    map.delete(key)
    return items
  }
}

const direct = ({contactId, name}) => ({type: "direct", id: contactId, name})

function add(map, key, item) {
  map.set(key, [...(map.get(key) ?? []), item])
}
