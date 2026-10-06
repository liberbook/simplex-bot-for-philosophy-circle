import {chatItemToMessage, describeError, groupRef, memberRef, translateEvent} from "./EventTranslator.js"

class ChatCommandError extends Error {
  constructor(what, response) {
    super(`${what}: ${describeError(response)}`)
    this.response = response
  }
}

/**
 * The bot's gateway to SimpleX: typed operations on top of ChatConnection,
 * returning domain objects. Bot logic depends on this interface only, so it
 * can be replaced by a fake in tests.
 */
export class SimplexClient {
  /** @param {import("./ChatConnection.js").ChatConnection} connection */
  constructor(connection) {
    this.connection = connection
    this.userId = null
  }

  /** @param {(event: object) => void} fn receives domain events */
  onEvent(fn) {
    this.connection.onEvent((raw) => {
      for (const event of translateEvent(raw)) fn(event)
    })
  }

  onOpen(fn) {
    this.connection.onOpen(fn)
  }

  start() {
    return this.connection.start()
  }

  stop() {
    this.connection.stop()
  }

  /** @returns {Promise<{userId: number, name: string, image: string|null}|null>} image = data URI of the profile picture */
  async activeUser() {
    const r = await this.connection.send("/user")
    if (r.type !== "activeUser") return null
    this.userId = r.user.userId
    return {userId: r.user.userId, name: r.user.profile.displayName, image: r.user.profile.image ?? null}
  }

  /** @param {string} dataUri "data:image/png;base64,..." or "data:image/jpg;base64,..." */
  async setProfileImage(dataUri) {
    expect(await this.connection.send(`/set profile image ${dataUri}`), ["userProfileUpdated", "userProfileNoChange"], "set profile image")
  }

  async setFilesFolder(dir) {
    expect(await this.connection.send(`/files_folder ${dir}`), ["cmdOk"], "set files folder")
  }

  /** Creates the bot's contact address if needed and enables auto-accept. @returns {Promise<string>} link */
  async ensureAddress() {
    const user = this.#user()
    let r = await this.connection.send(`/_show_address ${user}`)
    if (r.type !== "userContactLink") {
      r = expect(await this.connection.send(`/_address ${user}`), ["userContactLinkCreated"], "create address")
    }
    const link = r.contactLink?.connLinkContact ?? r.connLinkContact
    // keep whatever else is configured (auto-reply); only switch auto-accept on
    const settings = {businessAddress: false, ...r.contactLink?.addressSettings, autoAccept: {acceptIncognito: false}}
    expect(await this.connection.send(`/_address_settings ${user} ${JSON.stringify(settings)}`), ["userContactLinkUpdated"], "enable auto-accept")
    return link.connShortLink ?? link.connFullLink
  }

  /** One-time invitation link for a private chat with the bot. @returns {Promise<string>} */
  async createInvitation() {
    const r = expect(await this.connection.send(`/_connect ${this.#user()}`), ["invitation"], "create invitation")
    return r.connLinkInvitation.connShortLink ?? r.connLinkInvitation.connFullLink
  }

  /**
   * Accept direct chats that group members open with the bot from a group.
   * Off by default in the CLI: the connection would then wait for a manual accept forever.
   */
  async acceptMemberContacts() {
    expect(await this.connection.send(`/_set accept member contacts ${this.#user()} on`), ["cmdOk"], "accept member contacts")
  }

  /**
   * Joins a group via its link, idempotently: the CLI's connection plan says
   * whether the link is new, already being joined, or a group the bot is in.
   * @returns {Promise<{status: "connecting"|"joined"|"own"|"notGroupLink", title: string|null, group?: object}>}
   */
  async joinGroupLink(link) {
    if (!/^(https?:\/\/|simplex:)\S+$/.test(link)) throw new Error("not a SimpleX link")
    const planResp = expect(await this.connection.send(`/_connect plan ${this.#user()} ${link}`), ["connectionPlan"], "check link")
    const plan = planResp.connectionPlan
    if (plan?.type !== "groupLink") return {status: "notGroupLink", title: null}
    const gp = plan.groupLinkPlan ?? {}
    if (gp.type === "known") return {status: "joined", title: groupRef(gp.groupInfo).title, group: groupRef(gp.groupInfo)}
    if (gp.type === "ownLink") return {status: "own", title: null}
    const title = gp.groupSLinkData_?.groupProfile?.displayName ?? null
    if (gp.type === "ok") {
      const {connFullLink, connShortLink} = planResp.connLink
      const prepared = connShortLink ? `${connFullLink} ${connShortLink}` : connFullLink
      expect(await this.connection.send(`/_connect ${this.#user()} ${prepared}`), ["sentInvitation", "sentConfirmation", "contactAlreadyExists"], "connect via link")
    }
    return {status: "connecting", title} // "ok" (now connecting) or already connecting
  }

  /** Sets the command menu and marks the profile as a bot. @param {string} spec e.g. `'Help':/help,'List':/list` (see bots/README in simplex-chat) */
  async setBotCommands(spec) {
    expect(await this.connection.send(`/set bot commands ${spec}`), ["userProfileUpdated", "userProfileNoChange"], "set bot commands")
  }

  /** @returns {Promise<{type: "group", id: number, name: string}[]>} */
  async listGroups() {
    const r = expect(await this.connection.send(`/_groups ${this.#user()}`), ["groupsList"], "list groups")
    return r.groups.map((g) => groupRef(g.groupInfo ?? g))
  }

  /** @returns {Promise<{contactId: number|null, name: string, status: string}[]>} */
  async listMembers(groupId) {
    const r = expect(await this.connection.send(`/_members #${groupId}`), ["groupMembers"], "list members")
    return r.group.members.map(memberRef)
  }

  async joinGroup(groupId) {
    expect(await this.connection.send(`/_join #${groupId}`), ["userAcceptedGroupSent"], "join group")
  }

  /** Last `count` messages of a group, oldest first. */
  async recentMessages(groupId, count) {
    const r = expect(await this.connection.send(`/_get chat #${groupId} count=${count}`), ["apiChat"], "read chat")
    return r.chat.chatItems.map((chatItem) => chatItemToMessage({chatInfo: r.chat.chatInfo, chatItem})).filter(Boolean)
  }

  /** @returns {Promise<import("../domain/Message.js").Message|null>} */
  async messageById(groupId, itemId) {
    const r = expect(await this.connection.send(`/_get chat #${groupId} around=${itemId} count=1`), ["apiChat"], "read chat item")
    const chatItem = r.chat.chatItems.find((ci) => ci.meta.itemId === itemId)
    return chatItem ? chatItemToMessage({chatInfo: r.chat.chatInfo, chatItem}) : null
  }

  /** @returns {Promise<{ok: true}|{ok: false, reason: string}>} */
  async receiveFile(fileId) {
    const r = await this.connection.send(`/freceive ${fileId} approved_relays=on`)
    if (r.type === "rcvFileAccepted") return {ok: true}
    if (r.type === "rcvFileAcceptedSndCancelled") return {ok: false, reason: "sender cancelled the transfer"}
    return {ok: false, reason: describeError(r)}
  }

  /**
   * @param {{[name: string]: number}} [mentions] display name -> group member id, for "@name" in the text
   * @param {number|null} [quotedItemId] answer this message (shown as a reply)
   * @returns {Promise<number|null>} the sent message's item id (to edit it later)
   */
  async sendText(chat, text, mentions = {}, quotedItemId = null) {
    const r = await this.#send(chat, [{msgContent: {type: "text", text}, mentions, ...(quotedItemId !== null ? {quotedItemId} : {})}], "send message")
    return r.chatItems?.[0]?.chatItem?.meta?.itemId ?? null
  }

  /** Replaces the text of a message the bot sent earlier. */
  async editText(chat, itemId, text) {
    expect(await this.connection.send(`/_update item ${chatPrefix(chat)}${chat.id} ${itemId} json ${JSON.stringify({msgContent: {type: "text", text}, mentions: {}})}`), ["chatItemUpdated"], "edit message")
  }

  /**
   * The bot's direct contacts with their state.
   * @returns {Promise<Array<{contactId: number, name: string, status: string, connStatus: string|null}>>}
   *   status: "active" | "deleted" (the other side deleted the chat) | "deletedByUser"; connStatus: "ready", "sndReady", "new", ... or null
   */
  async listContacts() {
    const r = expect(await this.connection.send(`/_contacts ${this.#user()}`), ["contactsList"], "list contacts")
    return (r.contacts ?? []).map((c) => ({contactId: c.contactId, name: c.localDisplayName, status: c.contactStatus ?? "active", connStatus: c.activeConn?.connStatus ?? null}))
  }

  /** Removes a direct contact and its conversation on the bot's side, without telling the other side. */
  async deleteContact(contactId) {
    expect(await this.connection.send(`/_delete @${contactId} full notify=off`), ["contactDeleted"], "delete contact")
  }

  /**
   * Opens a direct chat with a group member through the group (the member's
   * app joins on its own; the group must allow direct messages).
   * @returns {Promise<number>} the new contact's id
   */
  async createMemberContact(groupId, memberId) {
    const r = expect(await this.connection.send(`/_create member contact #${groupId} ${memberId}`), ["newMemberContact"], "create member contact")
    return r.contact.contactId
  }

  /** Sends the invitation for a contact created with createMemberContact, with a first message. */
  async sendMemberContactInvitation(contactId, text) {
    expect(await this.connection.send(`/_invite member contact @${contactId} json ${JSON.stringify({type: "text", text})}`), ["newMemberContactSentInv"], "invite member contact")
  }

  /**
   * Who currently reacts to a group message with the given emoji.
   * @returns {Promise<Array<{contactId: number|null, name: string, memberId: number, at: string}>>}
   */
  async reactionMembers(groupId, itemId, emoji) {
    const r = expect(await this.connection.send(`/_reaction members ${this.#user()} #${groupId} ${itemId} ${JSON.stringify({type: "emoji", emoji})}`), ["reactionMembers"], "list reactions")
    return (r.memberReactions ?? []).map((m) => ({contactId: m.groupMember?.memberContactId ?? null, name: m.groupMember?.localDisplayName ?? "?", memberId: m.groupMember?.groupMemberId, at: m.reactionTs}))
  }

  /** @param {number|null} [quotedItemId] answer this message (shown as a reply) */
  async sendFile(chat, filePath, caption = "", quotedItemId = null) {
    await this.#send(chat, [{fileSource: {filePath}, msgContent: {type: "file", text: caption}, mentions: {}, ...(quotedItemId !== null ? {quotedItemId} : {})}], "send file")
  }

  async #send(chat, composedMessages, what) {
    return expect(await this.connection.send(`/_send ${chatPrefix(chat)}${chat.id} json ${JSON.stringify(composedMessages)}`), ["newChatItems"], what)
  }

  #user() {
    if (this.userId === null) throw new Error("activeUser() must be called first")
    return this.userId
  }
}

const chatPrefix = (chat) => (chat.type === "group" ? "#" : "@")

function expect(response, types, what) {
  if (!types.includes(response?.type)) throw new ChatCommandError(what, response)
  return response
}
