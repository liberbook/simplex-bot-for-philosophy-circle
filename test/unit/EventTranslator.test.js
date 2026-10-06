import test from "node:test"
import assert from "node:assert/strict"
import {chatItemToMessage, safeName, translateEvent} from "../../src/transport/EventTranslator.js"

// shapes as observed from simplex-chat v7 CLI
const groupInfo = {groupId: 1, localDisplayName: "filedrop", groupProfile: {displayName: "filedrop"}, membership: {memberStatus: "connected", createdAt: "2026-09-07T09:00:00Z"}}
const member = {groupMemberId: 2, localDisplayName: "alice", memberContactId: 3, memberStatus: "connected"}
const fileItem = {
  chatInfo: {type: "group", groupInfo},
  chatItem: {
    chatDir: {type: "groupRcv", groupMember: member},
    meta: {itemId: 32, itemTs: "2026-09-07T10:00:00Z"},
    content: {type: "rcvMsgContent", msgContent: {type: "file", text: "please save"}},
    file: {fileId: 2, fileName: "report.pdf", fileSize: 65536, fileStatus: {type: "rcvInvitation"}, fileProtocol: "xftp"},
  },
}

test("group file item becomes a group message with a file offer", () => {
  const m = chatItemToMessage(fileItem)
  assert.deepEqual(m.chat, {type: "group", id: 1, name: "filedrop", title: "filedrop"})
  assert.equal(m.isReplayed, false) // received from the author
  assert.equal(chatItemToMessage({...fileItem, chatItem: {...fileItem.chatItem, meta: {itemId: 1, itemTs: "2026-09-07T08:59:00Z", forwardedByMember: 1}}}).isReplayed, true)
  assert.deepEqual(m.sender, {contactId: 3, name: "alice", memberId: 2})
  assert.equal(m.incoming, true)
  assert.equal(m.text, "please save")
  assert.deepEqual(m.file, {id: 2, name: "report.pdf", size: 65536, status: "rcvInvitation", path: null, contentType: "file"})
  assert.equal(m.quotedItemId, null)
  assert.equal(m.sentAt.toISOString(), "2026-09-07T10:00:00.000Z")
})

test("quoted reply and direct messages are recognised, own messages are outgoing", () => {
  const reply = chatItemToMessage({
    chatInfo: {type: "group", groupInfo},
    chatItem: {chatDir: {type: "groupRcv", groupMember: member}, meta: {itemId: 33}, content: {type: "rcvMsgContent", msgContent: {type: "text", text: "conatus"}}, quotedItem: {itemId: 32, content: {type: "file", text: ""}}},
  })
  assert.equal(reply.quotedItemId, 32)
  assert.equal(reply.hasFile, false)

  const direct = chatItemToMessage({
    chatInfo: {type: "direct", contact: {contactId: 3, localDisplayName: "alice"}},
    chatItem: {chatDir: {type: "directSnd"}, meta: {itemId: 5}, content: {type: "sndMsgContent", msgContent: {type: "text", text: "hi"}}},
  })
  assert.equal(direct.isDirect, true)
  assert.equal(direct.incoming, false)
})

test("system items and scoped group chats are ignored", () => {
  assert.equal(chatItemToMessage({chatInfo: {type: "group", groupInfo}, chatItem: {chatDir: {type: "groupRcv", groupMember: member}, meta: {itemId: 1}, content: {type: "rcvGroupEvent"}}}), null)
  assert.equal(chatItemToMessage({...fileItem, chatInfo: {type: "group", groupInfo, groupChatScope: {type: "memberSupport"}}}), null)
  assert.equal(chatItemToMessage({...fileItem, chatInfo: {type: "local", noteFolder: {}}}), null)
})

test("display names from other people cannot carry line breaks or control characters", () => {
  assert.equal(safeName("alice"), "alice")
  assert.equal(safeName("evil\nline\ttwo\u0007"), "evil line two")
  assert.equal(safeName("x".repeat(100)).length, 64)
  assert.equal(safeName(""), "unknown")
  assert.equal(safeName(undefined), "unknown")
  const m = chatItemToMessage({...fileItem, chatItem: {...fileItem.chatItem, chatDir: {type: "groupRcv", groupMember: {...member, localDisplayName: "bad\nname"}}}})
  assert.equal(m.sender.name, "bad name")
})

test("a file error without a chat item still identifies the file through the transfer record", () => {
  const [ev] = translateEvent({type: "rcvFileError", agentError: {type: "BROKER"}, rcvFileTransfer: {fileId: 9, fileInvitation: {fileName: "x.pdf", fileSize: 10}}})
  assert.equal(ev.kind, "fileFailed")
  assert.deepEqual(ev.file, {id: 9, name: "x.pdf", size: 10, status: "error", path: null})
})

test("events translate to domain events", () => {
  assert.equal(translateEvent({type: "newChatItems", chatItems: [fileItem]})[0].kind, "message")
  assert.deepEqual(translateEvent({type: "contactConnected", contact: {contactId: 4, localDisplayName: "bob"}}), [{kind: "contactConnected", contact: {contactId: 4, name: "bob"}}])
  assert.deepEqual(translateEvent({type: "receivedGroupInvitation", groupInfo: {...groupInfo, membership: {memberStatus: "invited"}}, contact: {contactId: 3, localDisplayName: "alice"}}), [
    {kind: "groupInvitation", group: {type: "group", id: 1, name: "filedrop", title: "filedrop", memberStatus: "invited"}, from: {contactId: 3, name: "alice"}},
  ])
  const done = translateEvent({type: "rcvFileComplete", chatItem: {chatInfo: fileItem.chatInfo, chatItem: {...fileItem.chatItem, file: {...fileItem.chatItem.file, fileStatus: {type: "rcvComplete"}, fileSource: {filePath: "report.pdf"}}}}})
  assert.deepEqual(done, [{kind: "fileReceived", file: {id: 2, name: "report.pdf", size: 65536, status: "rcvComplete", path: "report.pdf", contentType: "file"}}])
  const edited = translateEvent({type: "chatItemUpdated", chatItem: {...fileItem, chatItem: {...fileItem.chatItem, content: {type: "rcvMsgContent", msgContent: {type: "text", text: "new text"}}, file: undefined}}})
  assert.equal(edited[0].kind, "messageUpdated")
  assert.equal(edited[0].message.text, "new text")
  const deletions = translateEvent({type: "chatItemsDeleted", byUser: false, chatItemDeletions: [{deletedChatItem: fileItem}, {deletedChatItem: null}]})
  assert.equal(deletions.length, 1)
  assert.equal(deletions[0].kind, "messageDeleted")
  assert.equal(deletions[0].message.file.name, "report.pdf")
  assert.deepEqual(translateEvent({type: "chatItemsDeleted", byUser: true, chatItemDeletions: [{deletedChatItem: fileItem}]}), [])
  const voice = chatItemToMessage({...fileItem, chatItem: {...fileItem.chatItem, content: {type: "rcvMsgContent", msgContent: {type: "voice", text: "", duration: 3}}}})
  assert.equal(voice.file.contentType, "voice")
  assert.deepEqual(translateEvent({type: "chatItemsStatusesUpdated"}), [])
  assert.deepEqual(translateEvent({type: "userJoinedGroup", groupInfo: {...groupInfo, membership: {memberStatus: "connected"}}}), [
    {kind: "joinedGroup", group: {type: "group", id: 1, name: "filedrop", title: "filedrop", memberStatus: "connected"}},
  ])
})

test("the other side deleting the chat becomes a contactDeleted event", () => {
  assert.deepEqual(translateEvent({type: "contactDeletedByContact", contact: {contactId: 7, localDisplayName: "sam", contactStatus: "deleted"}}), [{kind: "contactDeleted", contact: {contactId: 7, name: "sam"}}])
})

test("a reaction on a group message becomes a reaction event with the member who reacted", () => {
  const raw = {
    type: "chatItemReaction",
    added: true,
    reaction: {
      chatInfo: {type: "group", groupInfo},
      chatReaction: {chatDir: {type: "groupRcv", groupMember: member}, chatItem: {chatDir: {type: "groupSnd"}, meta: {itemId: 77, itemTs: "2026-09-09T10:00:00Z"}, content: {type: "sndMsgContent", msgContent: {type: "text", text: "POLL #1"}}}, sentAt: "2026-09-09T10:01:00Z", reaction: {type: "emoji", emoji: "👍"}},
    },
  }
  assert.deepEqual(translateEvent(raw), [{kind: "reaction", reaction: {chat: {type: "group", id: 1, name: "filedrop", title: "filedrop"}, itemId: 77, sender: {contactId: 3, name: "alice", memberId: 2}, emoji: "👍", added: true}}])
  assert.equal(translateEvent({...raw, added: false})[0].reaction.added, false)
  assert.deepEqual(translateEvent({type: "chatItemReaction", added: true, reaction: {chatInfo: {type: "group", groupInfo}, chatReaction: {chatDir: {type: "groupRcv", groupMember: member}, chatItem: {meta: {itemId: 77}}, reaction: {type: "unknown"}}}}), [], "a reaction the CLI does not know is ignored")
})

test("a member opening a direct chat from the group becomes a memberContact event", () => {
  const events = translateEvent({type: "newMemberContactReceivedInv", contact: {contactId: 7, localDisplayName: "alice"}, groupInfo, member})
  assert.deepEqual(events, [{kind: "memberContact", contact: {contactId: 7, name: "alice"}, group: {type: "group", id: 1, name: "filedrop", title: "filedrop", memberStatus: "connected"}}])
})
