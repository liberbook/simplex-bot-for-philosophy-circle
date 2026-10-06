import path from "node:path"
import {isAcceptable, isSafeFileName} from "../domain/Message.js"
import {formatSize} from "../util/format.js"

/**
 * Group-side behaviour: keeps EVERY file posted in a watched group by asking the
 * gateway to download it into the archive folder, within the quota - silently
 * (the group is a conversation; refusals go to the log). It also tells which
 * file a request refers to (`findRequested`) - the Courier sends that one privately.
 */
export class Archivist {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("./TriggerWord.js").TriggerWord} deps.rule the fetch word
   * @param {import("./WatchedGroups.js").WatchedGroups} deps.groups
   * @param {import("./StorageQuota.js").StorageQuota} deps.quota also tracks the downloads in flight
   * @param {import("../storage/FolderFileStore.js").FolderFileStore} deps.store the archive
   * @param {import("../storage/FolderFileStore.js").FolderFileStore} [deps.deleted] the deleted folder (files whose post was deleted for everyone go there)
   * @param {import("../util/logger.js").Logger} deps.logger
   */
  constructor({gateway, rule, groups, quota, store, deleted = null, logger, lookback = 20}) {
    this.gateway = gateway
    this.rule = rule
    this.groups = groups
    this.quota = quota
    this.store = store
    this.deleted = deleted
    this.logger = logger
    this.lookback = lookback // how many recent group messages a bare fetch word may refer to
  }

  /** @param {import("../domain/Message.js").Message} message a file posted in a watched group is kept */
  async handle(message) {
    if (!message.isGroup || !message.incoming || !message.hasFile || !this.groups.matches(message.chat)) return
    await this.save(message.file, message)
  }

  /**
   * Which file a group message asks for with the fetch word: the quoted post's
   * file in a reply that is the bare word; otherwise (the SimpleX apps' "comments" on a post reach the
   * CLI as plain messages, the parent link is not exposed) the BARE word refers
   * to the latest file posted before it, and a text naming a recent file (the whole
   * name with its extension, "conatus report.pdf") to that file. A sentence that merely uses the word ("conatus у Спинозы - это
   * стремление…") is conversation.
   * @returns {Promise<{file: object}|{file: null}|null>} null = not a request; {file: null} = a request with no file near it
   */
  async findRequested(message) {
    if (!message.isGroup || !message.incoming || message.hasFile || !this.groups.matches(message.chat) || !this.rule.mentions(message.text)) return null
    const bare = this.rule.isBare(message.text)
    if (message.quotedItemId !== null) {
      if (!bare) return null // "what does conatus mean here?" answering a file is a question, not a request
      const quoted = await this.gateway.messageById(message.chat.id, message.quotedItemId)
      return {file: quoted?.hasFile ? quoted.file : null}
    }
    const recent = await this.gateway.recentMessages(message.chat.id, this.lookback)
    const candidates = recent.filter((m) => m.hasFile && m.incoming && m.itemId < message.itemId)
    const named = candidates.filter((m) => namesFile(message.text, m.file.name))
    if (named.length === 0 && !bare) return null
    return {file: (named.length > 0 ? named : candidates).at(-1)?.file ?? null}
  }

  /**
   * Where a file of a post is now.
   * @returns {{state: "kept", name: string}|{state: "downloading"}|{state: "missing", name: string}}
   */
  locate(file) {
    if (this.quota.isReserved(file.id)) return {state: "downloading"}
    const name = path.basename(file.path ?? file.name)
    if (file.path && this.store.exact(name)[0]) return {state: "kept", name}
    return {state: "missing", name: file.name}
  }

  /** Catch up on files posted while the bot was offline. */
  async scan(count) {
    if (count <= 0) return
    for (const group of await this.groups.list()) {
      try {
        const messages = await this.gateway.recentMessages(group.id, count)
        for (const message of messages) await this.handle(message)
      } catch (e) {
        this.logger.warn(`scan of #${group.name} failed: ${e.message}`)
      }
    }
  }

  describe() {
    return `keeping every shared file; "${this.rule.word}" sends one privately`
  }

  /** Whether a download of this file is in flight. */
  isDownloading(fileId) {
    return this.quota.isReserved(fileId)
  }

  /**
   * A post was deleted for everyone: its archived file follows the author's
   * intent and moves to the deleted folder (recoverable with /restore).
   * @returns {{name: string, storedAs: string}|null} the file's name in the archive and in the deleted folder
   */
  onMessageDeleted(message) {
    if (!message.isGroup || !message.hasFile || !this.groups.matches(message.chat) || !this.deleted) return null
    const name = path.basename(message.file.path ?? message.file.name)
    const archived = this.store.exact(name)[0]
    if (!archived) return null
    try {
      const storedAs = this.store.moveTo(archived.name, this.deleted)
      this.logger.info(`post with ${archived.name} was deleted in #${message.chat.name} - moved to the deleted folder as ${storedAs}`)
      return {name: archived.name, storedAs}
    } catch (e) {
      this.logger.warn(`cannot move ${archived.name} to the deleted folder: ${e.message}`)
      return null
    }
  }

  /**
   * A download finished: release its reservation.
   * @returns {{file: object, storedAs: string}|null} the file's name in the archive, or null if it was not ours
   */
  onFileReceived(file) {
    if (!file || !this.quota.release(file.id)) return null
    const storedAs = path.basename(file.path ?? file.name)
    this.logger.info(`saved: ${storedAs} (${formatSize(file.size)})`)
    return {file, storedAs}
  }

  onFileFailed(file, reason) {
    if (!file || !this.quota.release(file.id)) return
    this.logger.warn(`download of ${file.name} failed: ${reason}`)
  }

  /**
   * Starts downloading a file offer (within the quota). Refusals are logged here;
   * the group hears nothing - a class command that asked (`claim`) reports them.
   * A download already in flight counts as started for a claim.
   * @returns {Promise<{ok: boolean, reason?: "downloading"|"unavailable"|"unsafe"|"full"|"failed"}>}
   */
  async save(file, cause, {claim = false} = {}) {
    if (this.quota.isReserved(file.id)) return claim ? {ok: true} : {ok: false, reason: "downloading"}
    if (!isAcceptable(file)) {
      this.logger.debug(`skip ${file.name}: status ${file.status}`)
      return {ok: false, reason: "unavailable"}
    }
    if (!isSafeFileName(file.name)) {
      this.logger.warn(`refusing a file with an unsafe name from ${cause.sender.name}: ${JSON.stringify(file.name)}`)
      return {ok: false, reason: "unsafe"}
    }
    const room = this.quota.reserve(file.id, file.size)
    if (!room.ok) {
      this.logger.warn(`refusing ${file.name} (${formatSize(file.size)}): ${room.reason}`)
      return {ok: false, reason: "full"}
    }
    const result = await this.gateway.receiveFile(file.id)
    if (!result.ok) {
      this.quota.release(file.id)
      this.logger.warn(`cannot save ${file.name}: ${result.reason}`)
      return {ok: false, reason: "failed"}
    }
    this.logger.info(`saving ${file.name} (${formatSize(file.size)}) from #${cause.chat.name}${claim ? " for a class" : ""}, posted by ${cause.sender.name}`)
    return {ok: true}
  }
}

/**
 * Whether a text names a file: the whole name with its extension, standing apart
 * from letters and digits. A bare word ("ethics") never counts - a sentence may
 * use any word, and a file may be called anything.
 */
function namesFile(text, name) {
  if (!name.includes(".")) return false
  const at = text.toLowerCase().indexOf(name.toLowerCase())
  if (at < 0) return false
  const before = text[at - 1] ?? " "
  const after = text[at + name.length] ?? " "
  return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)
}
