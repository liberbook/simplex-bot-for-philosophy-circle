import {Message} from "../../src/domain/Message.js"

/** In-memory stand-in for SimplexClient recording what the bot asked for. */
export class FakeGateway {
  constructor({groups = [], members = {}, items = {}, recent = []} = {}) {
    this.groups = groups // [{type:"group", id, name}]
    this.members = members // groupId -> [{contactId, name, status}]
    this.items = items // `${groupId}:${itemId}` -> Message
    this.recent = recent // Messages returned by recentMessages(), oldest first
    this.received = [] // file ids passed to receiveFile
    this.sent = [] // {chat, text} | {chat, filePath}
    this.edits = [] // {chat, itemId, text}
    this.reactions = {} // `${groupId}:${itemId}:${emoji}` -> members for reactionMembers()
    this.receiveResult = {ok: true}
    this.invitations = 0
    this.nextItemId = 100
  }
  async activeUser() {
    return {name: "spinoza", userId: 1}
  }
  async listContacts() {
    return this.contacts ?? []
  }
  async deleteContact(contactId) {
    this.deleted = [...(this.deleted ?? []), contactId]
    this.contacts = (this.contacts ?? []).filter((c) => c.contactId !== contactId)
  }
  async createMemberContact(groupId, memberId) {
    if (this.memberContactError) throw new Error(this.memberContactError)
    this.memberContacts = [...(this.memberContacts ?? []), {groupId, memberId, contactId: this.nextItemId}]
    return this.nextItemId++
  }
  async sendMemberContactInvitation(contactId, text) {
    this.invitationsSent = [...(this.invitationsSent ?? []), {contactId, text}]
  }
  async editText(chat, itemId, text) {
    this.edits.push({chat, itemId, text})
  }
  async reactionMembers(groupId, itemId, emoji) {
    return this.reactions[`${groupId}:${itemId}:${emoji}`] ?? []
  }
  async joinGroupLink(link) {
    this.connected = [...(this.connected ?? []), link]
    if (!link.includes("/g#")) return {status: "notGroupLink", title: null}
    if (link.includes("known")) return {status: "joined", title: "linked", group: {type: "group", id: 9, name: "linked", title: "linked"}}
    return {status: "connecting", title: "linked"}
  }
  async createInvitation() {
    return `https://simplex.chat/invitation#${++this.invitations}`
  }
  async listGroups() {
    return this.groups
  }
  async listMembers(groupId) {
    return this.members[groupId] ?? []
  }
  async messageById(groupId, itemId) {
    return this.items[`${groupId}:${itemId}`] ?? null
  }
  async recentMessages() {
    return this.recent
  }
  async receiveFile(fileId) {
    this.received.push(fileId)
    return this.receiveResult
  }
  async sendText(chat, text, mentions = {}, quotedItemId = null) {
    this.sent.push({chat, text, ...(Object.keys(mentions).length > 0 ? {mentions} : {}), ...(quotedItemId !== null ? {quotedItemId} : {})})
    return this.nextItemId++
  }
  async sendFile(chat, filePath, caption = "", quotedItemId = null) {
    this.sent.push({chat, filePath, ...(caption ? {caption} : {}), ...(quotedItemId !== null ? {quotedItemId} : {})})
  }
}

export const GROUP = {type: "group", id: 1, name: "filedrop", title: "filedrop", memberStatus: "connected"}
export const OTHER_GROUP = {type: "group", id: 2, name: "random", title: "random", memberStatus: "connected"}
export const ALICE = {contactId: 3, name: "alice", memberId: 2}
export const DIRECT_ALICE = {type: "direct", id: 3, name: "alice"}

export function groupMessage(overrides = {}) {
  return new Message({chat: GROUP, sender: ALICE, incoming: true, itemId: 10, text: "", ...overrides})
}

export function directMessage(text, overrides = {}) {
  return new Message({chat: DIRECT_ALICE, sender: ALICE, incoming: true, itemId: 20, text, ...overrides})
}

export function offer(overrides = {}) {
  return {id: 7, name: "report.pdf", size: 1024, status: "rcvInvitation", path: null, contentType: "file", ...overrides}
}
