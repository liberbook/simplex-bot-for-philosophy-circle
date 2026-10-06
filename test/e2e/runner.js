#!/usr/bin/env node
// End-to-end scenario against the Docker network (see docker/compose.yml):
// three simulated users (alice, bob, carol) driven through their own
// simplex-chat CLIs, the bot running on its own CLI, local relays only.
//
// alice creates the group and invites the bot and bob; carol never joins.
// Every file posted in the group must land in the bot's archive, silently, and
// the 100 KiB storage limit is enforced; "conatus" as a reply to a file (or
// right after it) sends that file to the member privately; bob can list and
// download privately; carol is refused (members-only mode). alice
// becomes admin with the secret: only she can add the bot to a group, delete
// files, see the storage report and create invitations.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import {ChatPeer, sleep} from "./ChatPeer.js"

const env = (name, fallback) => {
  const v = process.env[name] ?? fallback
  if (v === undefined) throw new Error(`missing env ${name}`)
  return v
}
const cfg = {
  botName: env("BOT_NAME", "spinoza"),
  group: env("GROUP", "filedrop"),
  botAddressFile: env("BOT_ADDRESS_FILE"),
  adminSecret: env("ADMIN_SECRET"),
  botFiles: env("BOT_FILES"),
  botDeleted: env("BOT_DELETED"),
  botState: path.dirname(env("BOT_ADDRESS_FILE")), // .../state - sessions.json lives next to address.txt
  aliceWs: env("ALICE_WS"),
  bobWs: env("BOB_WS"),
  carolWs: env("CAROL_WS"),
  aliceFiles: env("ALICE_FILES"), // alice's files folder as the runner sees it
  cliFiles: env("CLI_FILES"), // ...and as alice's CLI sees it
  bobFiles: env("BOB_FILES"),
}

const t0 = Date.now()
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${m}`)
let passed = 0

async function step(name, fn) {
  log(`---- ${name}`)
  try {
    await fn()
    passed++
    log(`PASS  ${name}`)
  } catch (e) {
    log(`FAIL  ${name}\n       ${e.message}`)
    throw e
  }
}

const randomFile = (dir, name, size) => {
  const bytes = crypto.randomBytes(size)
  fs.writeFileSync(path.join(dir, name), bytes)
  return bytes
}

async function waitFor(description, check, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const result = await check()
    if (result) return result
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${description}`)
    await sleep(1000)
  }
}

const archivedBytes = (name) => {
  const p = path.join(cfg.botFiles, name)
  return fs.existsSync(p) ? fs.readFileSync(p) : null
}
const namesIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isFile()).sort() : [])
const archiveNames = () => namesIn(cfg.botFiles)
const deletedNames = () => namesIn(cfg.botDeleted)

const composed = (msgContent, extra = {}) => JSON.stringify([{msgContent, mentions: {}, ...extra}])
/** Posts a file to the group and waits until the sender's CLI finished uploading it to the relay. */
async function sendGroupFile(peer, groupId, fileName, caption, extra = {}) {
  const sent = await peer.expect(`/_send #${groupId} json ${composed({type: "file", text: caption}, {fileSource: {filePath: path.join(cfg.cliFiles, fileName)}, ...extra})}`, ["newChatItems"], 60_000)
  const isOurs = (e) => e.chatItem?.chatItem?.file?.fileName === fileName
  const ev = await peer.waitEvent(`${peer.name}: upload of ${fileName}`, (e) => (e.type === "sndFileCompleteXFTP" || e.type === "sndFileError" || e.type === "sndFileWarning") && isOurs(e), 120_000)
  if (ev.type !== "sndFileCompleteXFTP") throw new Error(`${peer.name}: upload of ${fileName} failed: ${JSON.stringify(ev).slice(0, 400)}`)
  return sent
}
const sendGroupText = (peer, groupId, text, extra = {}) => peer.expect(`/_send #${groupId} json ${composed({type: "text", text}, extra)}`, ["newChatItems"])
const addDays = (ymd, n) => new Date(Date.parse(ymd) + n * 86_400_000).toISOString().slice(0, 10)
/** "2026-09-15" -> "15.09.2026" - the one date format of the bot's sentences and cards */
const dmy = (ymd) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`
const shortDate = (ymd) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}` // "15.09" as the class lists show it
const sendDirectText = (peer, contactId, text) => peer.expect(`/_send @${contactId} json ${composed({type: "text", text})}`, ["newChatItems"])
const botSays = (peer, description, predicate, timeoutMs = 60_000) =>
  peer.waitDirectText(description, predicate, {from: cfg.botName, timeoutMs})

/** Waits for an event that arrives after `peer.events[before]` (waitEvent alone also matches older ones). */
const waitAfter = (peer, before, description, predicate, timeoutMs = 60_000) => peer.waitEvent(description, (e) => peer.events.indexOf(e) >= before && predicate(e), timeoutMs)
const directFileOffer = (fileName) => (e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.chatDir?.type === "directRcv" && chatItem.file?.fileName === fileName)
const directText = (predicate) => (e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.chatDir?.type === "directRcv" && predicate(chatItem.content?.msgContent?.text ?? ""))

/** Polls the member list until `memberName` is a connected member (group messages only reach connected members). */
const waitMemberConnected = (peer, groupId, memberName) =>
  waitFor(`${peer.name}: ${memberName} connected in group`, async () => {
    const r = await peer.expect(`/_members #${groupId}`, ["groupMembers"])
    return r.group.members.some((m) => m.localDisplayName === memberName && m.memberStatus === "connected")
  })

async function main() {
  const [alice, bob, carol] = await Promise.all([
    ChatPeer.connect("alice", cfg.aliceWs),
    ChatPeer.connect("bob", cfg.bobWs),
    ChatPeer.connect("carol", cfg.carolWs),
  ])
  const peers = [alice, bob, carol]
  const state = {}

  await step("CLIs are up with profiles", async () => {
    for (const p of peers) {
      const r = await p.expect("/user", ["activeUser"])
      if (r.user.profile.displayName !== p.name) throw new Error(`${p.name} has profile ${r.user.profile.displayName}`)
    }
  })

  await step("bot published its address", async () => {
    state.botAddress = await waitFor("bot address file", () => (fs.existsSync(cfg.botAddressFile) ? fs.readFileSync(cfg.botAddressFile, "utf8").trim() : null), 180_000)
    log(`bot address: ${state.botAddress.slice(0, 60)}...`)
  })

  await step("users connect to the bot and are greeted", async () => {
    state.botContact = {}
    for (const p of peers) {
      await p.expect(`/c ${state.botAddress}`, ["sentInvitation", "sentConfirmation"], 60_000)
      const ev = await p.waitEvent(`${p.name}: connected to bot`, (e) => e.type === "contactConnected" && e.contact.localDisplayName === cfg.botName)
      state.botContact[p.name] = ev.contact.contactId
      if (!String(ev.contact.profile?.image ?? "").startsWith("data:image/png;base64,")) throw new Error(`${p.name}: bot has no profile picture`)
      // nobody is a group member yet, so the greeting carries the limited (non-member) help
      await botSays(p, `${p.name}: greeting`, (t) => /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\nFiles and classes are for members/.test(t) && t.includes("/ethics") && !t.includes("/list"), 90_000)
    }
  })

  await step("alice becomes admin with the secret; wrong secrets are refused and then locked out", async () => {
    const wrongReplies = () => carol.events.filter((e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.chatDir?.type === "directRcv" && chatItem.content?.msgContent?.text === "Wrong secret.")).length
    for (let i = 1; i <= 5; i++) {
      await sendDirectText(carol, state.botContact.carol, `/admin wrong-${i}`)
      await waitFor(`carol: wrong secret reply ${i}`, () => wrongReplies() >= i, 30_000)
    }
    await sendDirectText(carol, state.botContact.carol, `/admin ${cfg.adminSecret}`) // right secret, but locked
    await botSays(carol, "carol: locked out", (t) => t.startsWith("Too many wrong secrets"))
    const before = carol.events.length
    await sendDirectText(carol, state.botContact.carol, `/admin ${cfg.adminSecret}`)
    await sleep(3000)
    const newBotTexts = carol.events.slice(before).filter((e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.chatDir?.type === "directRcv"))
    if (newBotTexts.length > 0) throw new Error("locked-out contact still got an answer")
    await sendDirectText(alice, state.botContact.alice, `/admin ${cfg.adminSecret}`)
    await botSays(alice, "alice: promoted", (t) => t.includes("you are an admin now"))
  })

  await step("the bot ignores a group invitation from a non-admin", async () => {
    const g = await carol.expect(`/g ${cfg.group}`, ["groupCreated"])
    await carol.expect(`/a ${cfg.group} ${cfg.botName} member`, ["sentGroupInvitation"])
    await sleep(6000)
    const r = await carol.expect(`/_members #${g.groupInfo.groupId}`, ["groupMembers"])
    const bot = r.group.members.find((m) => m.localDisplayName === cfg.botName)
    if (!bot || bot.memberStatus !== "invited") throw new Error(`bot member status in carol's group: ${bot?.memberStatus}`)
  })

  await step("alice and bob become contacts", async () => {
    const inv = await alice.expect("/c", ["invitation"])
    await bob.expect(`/c ${inv.connLinkInvitation.connFullLink}`, ["sentConfirmation", "sentInvitation"], 60_000)
    await alice.waitEvent("alice: bob connected", (e) => e.type === "contactConnected" && e.contact.localDisplayName === "bob")
    await bob.waitEvent("bob: alice connected", (e) => e.type === "contactConnected" && e.contact.localDisplayName === "alice")
  })

  await step("alice creates the group and the bot joins when invited", async () => {
    const g = await alice.expect(`/g ${cfg.group}`, ["groupCreated"])
    state.groupIdAlice = g.groupInfo.groupId
    // a command or a bare trigger word already in the group's history must not be answered when the bot joins and receives that history
    await alice.expect(`/_send #${state.groupIdAlice} json ${composed({type: "text", text: "/spinoza"})}`, ["newChatItems"])
    await alice.expect(`/_send #${state.groupIdAlice} json ${composed({type: "text", text: "conatus"})}`, ["newChatItems"])
    await sleep(1000)
    await alice.expect(`/a ${cfg.group} ${cfg.botName} member`, ["sentGroupInvitation"])
    await alice.waitEvent("alice: bot joined", (e) => e.type === "joinedGroupMember" && e.member.localDisplayName === cfg.botName, 90_000)
    await alice.waitGroupText("alice: group greeting", (t) => /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\n/.test(t) && t.includes("prius [date] - tie a file to the last class") && t.includes("/spinoza schedule - show the schedule"), {from: cfg.botName})
    await sleep(5000)
    const replayed = alice.events.some((e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.chatDir?.type === "groupRcv" && /^(One-time link for a private chat|The help was sent|Which file\?)/.test(chatItem.content?.msgContent?.text ?? "")))
    if (replayed) throw new Error("the bot answered /spinoza or the trigger word from the group's history")
    const privately = alice.events.some((e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.chatDir?.type === "directRcv" && /^Which file\?/.test(chatItem.content?.msgContent?.text ?? "")))
    if (privately) throw new Error("the bot answered the trigger word from the group's history privately")
  })

  await step("bob joins the group and connects to the bot member", async () => {
    await alice.expect(`/a ${cfg.group} bob member`, ["sentGroupInvitation"])
    const inv = await bob.waitEvent("bob: group invitation", (e) => e.type === "receivedGroupInvitation")
    state.groupIdBob = inv.groupInfo.groupId
    await bob.expect(`/_join #${state.groupIdBob}`, ["userAcceptedGroupSent"])
    await alice.waitEvent("alice: bob joined", (e) => e.type === "joinedGroupMember" && e.member.localDisplayName === "bob", 90_000)
    await waitMemberConnected(bob, state.groupIdBob, cfg.botName)
  })

  /** The bot's group messages among `peer`'s events since `before` (not the group's event items). */
  const botGroupItems = (peer, before) => peer.events.slice(before).filter((e) => e.type === "newChatItems").flatMap((e) => e.chatItems).filter(({chatItem}) => chatItem.chatDir?.type === "groupRcv" && chatItem.content?.type === "rcvMsgContent" && chatItem.chatDir?.groupMember?.localDisplayName === cfg.botName)
  const botGroupTexts = (peer, before) => botGroupItems(peer, before).filter(({chatItem}) => chatItem.content.msgContent?.type !== "file").map(({chatItem}) => chatItem.content.msgContent?.text)
  /** files the bot posted in the group: [{name, caption, quoted}] (quoted: the text of the message it answers) */
  const botGroupFiles = (peer, before) => botGroupItems(peer, before).filter(({chatItem}) => chatItem.content.msgContent?.type === "file").map(({chatItem}) => ({name: chatItem.file?.fileName, caption: chatItem.content.msgContent.text, quoted: chatItem.quotedItem?.content?.text ?? null}))
  const groupFileFromBot = (fileName) => (e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.chatDir?.type === "groupRcv" && chatItem.chatDir?.groupMember?.localDisplayName === cfg.botName && chatItem.file?.fileName === fileName)

  await step("every file posted in the group is archived, silently", async () => {
    const before = alice.events.length
    fs.mkdirSync(cfg.aliceFiles, {recursive: true})
    state.report = randomFile(cfg.aliceFiles, "report.pdf", 64 * 1024)
    state.notes = randomFile(cfg.aliceFiles, "notes.txt", 8 * 1024)
    await sendGroupFile(alice, state.groupIdAlice, "report.pdf", "please read this one")
    await sendGroupFile(alice, state.groupIdAlice, "notes.txt", "")
    state.reportItemBob = (await bob.waitFileOffer("report.pdf", "groupRcv")).chatItem.meta.itemId
    state.notesItemBob = (await bob.waitFileOffer("notes.txt", "groupRcv")).chatItem.meta.itemId
    await waitFor("report.pdf in archive", () => archivedBytes("report.pdf")?.length === state.report.length)
    await waitFor("notes.txt in archive", () => archivedBytes("notes.txt")?.length === state.notes.length)
    if (!archivedBytes("report.pdf").equals(state.report) || !archivedBytes("notes.txt").equals(state.notes)) throw new Error("archived bytes differ")
    await sleep(2000)
    const said = botGroupTexts(alice, before)
    if (said.length !== 0) throw new Error(`the bot spoke in the group about files: ${JSON.stringify(said)}`)
  })

  await step('replying "conatus" to a file: the bot posts the file again in the group, as a reply saying it is in the private chat too, and sends it there', async () => {
    const before = bob.events.length
    await bob.expect(`/_send #${state.groupIdBob} json ${composed({type: "text", text: "conatus"}, {quotedItemId: state.notesItemBob})}`, ["newChatItems"])
    const offer = await bob.waitFileOffer("notes.txt", "directRcv", 120_000)
    await bob.expect(`/freceive ${offer.chatItem.file.fileId} approved_relays=on`, ["rcvFileAccepted"], 60_000)
    const done = await bob.waitEvent("bob: notes.txt downloaded", (e) => e.type === "rcvFileComplete" && e.chatItem.chatItem.file.fileId === offer.chatItem.file.fileId, 120_000)
    const got = fs.readFileSync(path.join(cfg.bobFiles, path.basename(done.chatItem.chatItem.file.fileSource.filePath)))
    if (!got.equals(state.notes)) throw new Error("the privately sent bytes differ from the original")
    await waitAfter(bob, before, "bob: notes.txt posted again in the group", groupFileFromBot("notes.txt"), 60_000)
    const posted = botGroupFiles(bob, before)
    if (posted.length !== 1 || posted[0].name !== "notes.txt" || posted[0].caption !== "bob, the file is also in your private chat with me." || posted[0].quoted !== "conatus") throw new Error(`group copy: ${JSON.stringify(posted)}`)
    await sleep(2000)
    const said = botGroupTexts(bob, before)
    if (said.length !== 0) throw new Error(`the bot said more than the file's caption in the group: ${JSON.stringify(said)}`)
  })

  await step("conatus with no file near it gets 'Which file?' privately; a sentence with conatus in reply to a file is talk", async () => {
    const before = bob.events.length
    const remark = await sendGroupText(bob, state.groupIdBob, "a remark without a file")
    await sendGroupText(bob, state.groupIdBob, "conatus", {quotedItemId: remark.chatItems[0].chatItem.meta.itemId})
    await waitAfter(bob, before, "bob: which file, privately", directText((t) => t === "Which file? Write conatus as a reply to the file, or right after it was posted."))
    const mark = bob.events.length
    await sendGroupText(bob, state.groupIdBob, "what does conatus mean here?", {quotedItemId: state.reportItemBob})
    await sleep(4000)
    if (bob.events.slice(mark).some((e) => directFileOffer("report.pdf")(e) || directText(() => true)(e))) throw new Error("a sentence using the word was taken for a request")
    if (botGroupTexts(bob, before).length !== 0) throw new Error(`the bot spoke in the group: ${JSON.stringify(botGroupTexts(bob, before))}`)
  })

  await step("a file beyond the storage limit is refused - silently; asking for it gets 'no longer kept' privately", async () => {
    const before = alice.events.length
    randomFile(cfg.aliceFiles, "big.bin", 40 * 1024) // 72 KiB stored + 40 KiB > 100 KiB limit
    await sendGroupFile(alice, state.groupIdAlice, "big.bin", "")
    const bigItemBob = (await bob.waitFileOffer("big.bin", "groupRcv")).chatItem.meta.itemId
    await sleep(4000)
    if (archiveNames().join() !== "notes.txt,report.pdf") throw new Error(`archive: ${archiveNames()}`)
    const mark = bob.events.length
    await sendGroupText(bob, state.groupIdBob, "conatus", {quotedItemId: bigItemBob})
    await waitAfter(bob, mark, "bob: big.bin not kept, privately", directText((t) => t === "big.bin is no longer kept. The saved files: /files"))
    const said = botGroupTexts(alice, before)
    if (said.length !== 0) throw new Error(`the bot spoke in the group: ${JSON.stringify(said)}`)
    if (botGroupFiles(alice, before).length !== 0) throw new Error(`a file not kept was posted: ${JSON.stringify(botGroupFiles(alice, before))}`)
  })

  await step("a member lists the archive in a private chat", async () => {
    await sendDirectText(bob, state.botContact.bob, "/files")
    const text = await botSays(bob, "bob: list reply", (t) => t.startsWith("FILES · 2 · newest first\n\n1. ") && t.endsWith("Help: /files ?"))
    if (!text.includes("report.pdf") || !text.includes("notes.txt")) throw new Error(`list reply: ${text}`)
  })

  await step("a member downloads a file in a private chat, bytes intact", async () => {
    await sendDirectText(bob, state.botContact.bob, "/get report.pdf")
    const offer = await bob.waitFileOffer("report.pdf", "directRcv", 120_000)
    await bob.expect(`/freceive ${offer.chatItem.file.fileId} approved_relays=on`, ["rcvFileAccepted"], 60_000)
    const done = await bob.waitEvent("bob: download complete", (e) => e.type === "rcvFileComplete" && e.chatItem.chatItem.file.fileId === offer.chatItem.file.fileId, 120_000)
    const got = fs.readFileSync(path.join(cfg.bobFiles, path.basename(done.chatItem.chatItem.file.fileSource.filePath)))
    if (!got.equals(state.report)) throw new Error("downloaded bytes differ from the original")
  })

  await step("an unknown file name gets a not-found answer; a mistyped command a hint", async () => {
    await sendDirectText(bob, state.botContact.bob, "/get nope.bin")
    await botSays(bob, "bob: not-found reply", (t) => t === 'There is no file "nope.bin".\n\nList: /files')
    await sendDirectText(bob, state.botContact.bob, "/gett report.pdf")
    await botSays(bob, "bob: command hint", (t) => t.startsWith('I do not know the command "/gett".') && t.includes("/дай <номер|имя>"))
    await sendDirectText(bob, state.botContact.bob, "/get")
    await botSays(bob, "bob: get without a name", (t) => t === "Give the file's number or name.\n\nExample: /get 3\nList: /files")
  })

  await step("/? is short; /?? lists every command by section, never /invite", async () => {
    await sendDirectText(bob, state.botContact.bob, "/?")
    const help = await botSays(bob, "bob: short help", (t) => /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\nI keep the group's files, organise the classes/.test(t) && t.endsWith("Commands shorten to one letter: /f, /c, /v, /e, /w.\nEvery command: /??"))
    if (!help.includes("/files - the saved files") || !help.includes("/vote - polls") || help.includes("/get")) throw new Error(`short help too narrow or too wide: ${help}`)
    await sendDirectText(bob, state.botContact.bob, "help")
    await botSays(bob, "bob: the word help still works", (t) => /\n\[Э[^\]]+\]\n\nI keep the group's files/.test(t) && t.endsWith("Every command: /??") && t !== help)
    if (help.includes("/delete") || help.includes("/move") || /admin/i.test(help) || help.includes("/'")) throw new Error(`short help too wide: ${help}`)
    await sendDirectText(bob, state.botContact.bob, "/??")
    const full = await botSays(bob, "bob: full help", (t) => /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\nFILES\n/.test(t) && t.includes("\nOTHER\n") && t.includes("\nSHORT FORMS\n") && t.includes("\n/f delete 2 = /files delete 2\n") && t.endsWith("/<section> ? - a section's help: /f ?, /c ?, /v ?, /e ?"))
    if (!full.includes("/delete <number|name>") || !full.includes("/class [date] - one class and its materials") || !full.includes("/class list [month|year|archive] - the lists and the archive of classes") || !full.includes("/vote close <number> - end a poll") || !full.includes("/ethics search <text> - find") || !full.includes("prius [date]")) throw new Error(`full help too narrow: ${full}`)
    await sendDirectText(bob, state.botContact.bob, "/files ?")
    await botSays(bob, "bob: files section help", (t) => t.startsWith("FILES\n\n/files [pattern]\n") && t.includes("\n/get <number|name>\n") && t.includes("Also: /files space, /ф м"))
    await sendDirectText(bob, state.botContact.bob, "/class ?")
    await botSays(bob, "bob: class section help", (t) => t.startsWith("CLASSES\n\n/class [date]\nThe next class, or the one on that date.\nShort: /з [date]\n\n/class list [month|year|archive]") && t.includes("Short: /з о"))
    if (/admin/i.test(full) || full.includes("/invite") || full.includes("/join") || full.includes("/'") || full.includes("(/")) throw new Error(`full help too wide: ${full}`)
  })

  await step("/ethics shows Spinoza's theorems and its help", async () => {
    await sendDirectText(bob, state.botContact.bob, "/ethics Э1т7")
    const text = await botSays(bob, "bob: theorem", (t) => t.startsWith("[Э1т7] Часть I · Теорема 7"))
    if (!text.includes("[Доказательство]")) throw new Error(`theorem reply: ${text.slice(0, 200)}`)
    await sendDirectText(bob, state.botContact.bob, "/ethics search любовь part 3")
    await botSays(bob, "bob: search", (t) => t.startsWith("SEARCH IN THE ETHICS · любовь · part 3 · ") && t.includes("\nЭ3") && t.endsWith("Open: /ethics <ID>")) // the filter sits in the heading, so no "narrow down by part" hint
    await sendDirectText(bob, state.botContact.bob, "/ethics list 1")
    await botSays(bob, "bob: structure of part I", (t) => t.startsWith("ETHICS · PART I · 122 entries\n\nDefinitions · 8\n") && t.endsWith("List them: /ethics list 1 теоремы\nOpen: /ethics <ID>"))
    await sendDirectText(bob, state.botContact.bob, "/ethics")
    await botSays(bob, "bob: ethics memo", (t) => t.startsWith('SPINOZA, "ETHICS"\n\nRead:\n/ethics E1p7 - ') && t.endsWith("Help: /ethics ?"))
    // the non-Russian texts show the Latin identifiers and the Latin one-letter sections: both must really work
    await sendDirectText(bob, state.botContact.bob, "/e E1p7")
    await botSays(bob, "bob: the Latin identifier and the Latin section letter", (t) => t.startsWith("[Э1т7] Часть I · Теорема 7"))
    await sendDirectText(bob, state.botContact.bob, "/ethics ?")
    await botSays(bob, "bob: ethics identifiers", (t) => t.startsWith('IDENTIFIERS OF THE "ETHICS"\n\nЭ1т7 ') && t.includes("\nMODES\n") && t.includes("\nSEARCH\n"))
    await sendDirectText(bob, state.botContact.bob, "/ethics пл Э1т8")
    await botSays(bob, "bob: full mode by its short word", (t) => t.startsWith("[Э1т8] Часть I · Теорема 8") && t.includes("[Схолия 1]"))
  })

  await step("a non-member is refused and sees only the commands available to them", async () => {
    await sendDirectText(carol, state.botContact.carol, "/list")
    await botSays(carol, "carol: refusal", (t) => t.includes("only members"))
    await sendDirectText(carol, state.botContact.carol, "/?")
    const help = await botSays(carol, "carol: limited help", (t) => /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\nFiles and classes are for members/.test(t))
    if (help.includes("/list") || help.includes("In the group")) throw new Error(`non-member help too wide: ${help}`)
  })

  await step("/spinoza from a member with a private chat: the personal help arrives privately, the group gets one line", async () => {
    await sendGroupText(bob, state.groupIdBob, "/spinoza")
    const personal = await botSays(bob, "bob: personal help", (t) => /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\nI keep the group's files/.test(t) && t.endsWith("/spinoza - this help into the private chat"))
    if (!personal.includes("/files - the saved files") || !personal.includes("/vote - polls") || !personal.includes("\nIn the group:\nevery file in the group is kept in the archive\nconatus - as a reply to a file or right after it: I post the file in the group and send it to you privately\n") || !personal.includes("/spinoza class [date] [topic]")) throw new Error(`personal help: ${personal}`)
    await sendDirectText(bob, state.botContact.bob, "/spinoza")
    await botSays(bob, "bob: personal help asked privately", (t) => /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\nI keep the group's files/.test(t) && t.includes("\nIn the group:\n") && t !== personal)
    await bob.waitGroupText("bob: help sent privately", (t) => t === "The help was sent to you privately.", {from: cfg.botName})
    await sendGroupText(bob, state.groupIdBob, "/spinoza ??")
    await botSays(bob, "bob: full help privately", (t) => /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\nFILES\n/.test(t) && t.includes("\nIN THE GROUP\n"))
  })

  await step("a private command typed in the group gets one line saying where it works; plain words are left alone", async () => {
    await sendGroupText(bob, state.groupIdBob, "/list")
    await bob.waitGroupText("bob: redirected to the private chat", (t) => t === "This is done in the private chat: write to me or send /spinoza.", {from: cfg.botName})
    // talk that starts with a command word, or uses the trigger word in a sentence, is not a command
    const before = bob.events.length
    for (const text of ["list of things to read", "Class was great yesterday", "schedule stays as it is", "spinoza said: the striving of the mind is the conatus"]) await sendGroupText(bob, state.groupIdBob, text)
    await sleep(4000)
    const fromBot = bob.events.slice(before).filter((e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.chatDir?.type === "groupRcv" && chatItem.chatDir?.groupMember?.localDisplayName === cfg.botName))
    if (fromBot.length !== 0) throw new Error(`the bot answered plain talk: ${JSON.stringify(fromBot.map((e) => e.chatItems.map((i) => i.chatItem.content?.msgContent?.text)))}`)
    const hints = bob.events.filter((e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.chatDir?.type === "groupRcv" && chatItem.content?.msgContent?.text === "This is done in the private chat: write to me or send /spinoza."))
    if (hints.length !== 1) throw new Error(`expected exactly one hint, got ${hints.length}`)
  })

  await step("upkeep commands are refused for a non-member; admin commands for a plain member", async () => {
    await sendDirectText(carol, state.botContact.carol, "/space")
    await botSays(carol, "carol: space refused", (t) => t.includes("only members"))
    await sendDirectText(carol, state.botContact.carol, "/delete notes.txt")
    await botSays(carol, "carol: delete refused", (t) => t.includes("only members"))
    if (archiveNames().join() !== "notes.txt,report.pdf") throw new Error(`archive: ${archiveNames()}`)
    await sendDirectText(bob, state.botContact.bob, "/admins")
    await botSays(bob, "bob: admins refused", (t) => t.includes("admins only"))
  })

  await step("a member sees the storage report, deletes one file by exact name, restores it", async () => {
    await sendDirectText(bob, state.botContact.bob, "/space")
    const report = await botSays(bob, "bob: space", (t) => t.startsWith("STORAGE\n\nArchive: 72 KiB of 100 KiB"))
    if (!report.includes("\nFree in the archive: 28 KiB\n\nDeleted folder empty\nKept for: 30 days\n\nFree disk space: ")) throw new Error(`report: ${report}`)

    await sendDirectText(bob, state.botContact.bob, "/delete *.pdf") // patterns are refused
    await botSays(bob, "bob: pattern refused", (t) => t === "FOUND · 1 · *.pdf\n\n1. report.pdf\n\nDelete: /delete 1")
    if (archiveNames().join() !== "notes.txt,report.pdf") throw new Error(`archive changed: ${archiveNames()}`)

    await sendDirectText(bob, state.botContact.bob, "/delete notes.txt")
    await botSays(bob, "bob: deleted", (t) => t === 'Moved "notes.txt" to the deleted folder.\n\nBring back: /restore 1\nDeleted folder: /deleted')
    if (archiveNames().join() !== "report.pdf") throw new Error(`archive: ${archiveNames()}`)
    if (deletedNames().join() !== "notes.txt" || !fs.readFileSync(path.join(cfg.botDeleted, "notes.txt")).equals(state.notes)) throw new Error(`deleted folder: ${deletedNames()}`)

    await sendDirectText(bob, state.botContact.bob, "/deleted")
    await botSays(bob, "bob: deleted list", (t) => t.startsWith("DELETED · 1 · newest first\n\n1. notes.txt · 8.0 KiB · ") && t.endsWith("Bring back: /restore <number>\nHelp: /files ?"))
    await sendDirectText(bob, state.botContact.bob, "/space")
    await botSays(bob, "bob: space with deleted", (t) => t.startsWith("STORAGE\n\nArchive: 64 KiB of 100 KiB") && t.includes("\nDeleted folder: 8.0 KiB · 1 file\n"))

    await sendDirectText(bob, state.botContact.bob, "/restore notes.txt")
    await botSays(bob, "bob: restored", (t) => t === 'Restored "notes.txt" to the archive.\n\nList: /files')
    if (archiveNames().join() !== "notes.txt,report.pdf" || deletedNames().length !== 0) throw new Error(`after restore: ${archiveNames()} / ${deletedNames()}`)
    await sendDirectText(bob, state.botContact.bob, "/list")
    const listing = await botSays(bob, "bob: list for numbering", (t) => t.startsWith("FILES · 2 · newest first\n\n1. ") && t.includes(" notes.txt · "))
    const number = Number(listing.split("\n").find((l) => l.includes(" notes.txt · ")).split(".")[0]) // "N. notes.txt · 8.0 KiB · <date>"
    await sendDirectText(bob, state.botContact.bob, `/delete ${number}`) // leave it deleted for the remaining steps
    await botSays(bob, "bob: deleted by number", (t) => t.startsWith('Moved "notes.txt" to the deleted folder.') && t.includes("Bring back: /restore 1"))
  })

  await step("/status reports version, groups and storage to a member", async () => {
    await sendDirectText(bob, state.botContact.bob, "/status")
    const text = await botSays(bob, "bob: status", (t) => t.startsWith(`STATUS\n\n${cfg.botName} 1.1.0 (e2e) · up `))
    if (!text.includes("\nGroups: filedrop\nArchive: 1 file · 64 KiB of 100 KiB\nDeleted folder: 1 file · 8.0 KiB\nNo classes yet\nNo schedule") || /admin/i.test(text)) throw new Error(`status: ${text}`)
  })

  await step("a bare 'conatus' comment (no reply link) posts the latest file before it again in the group and sends it privately", async () => {
    const bytes = randomFile(cfg.aliceFiles, "comment.pdf", 4 * 1024)
    const sent = await sendGroupFile(alice, state.groupIdAlice, "comment.pdf", "")
    state.commentItemAlice = sent.chatItems[0].chatItem.meta.itemId
    await bob.waitFileOffer("comment.pdf", "groupRcv")
    const before = bob.events.length
    await sendGroupText(bob, state.groupIdBob, "Conatus!") // right away: the bot may still be downloading it - then it is posted and sent once saved
    await bob.waitFileOffer("comment.pdf", "directRcv", 120_000)
    await waitAfter(bob, before, "bob: comment.pdf posted again in the group", groupFileFromBot("comment.pdf"), 120_000)
    await waitFor("comment.pdf in archive", () => archivedBytes("comment.pdf")?.length === bytes.length)
  })

  await step("a post deleted for everyone takes its archived file to the deleted folder", async () => {
    await alice.expect(`/_delete item #${state.groupIdAlice} ${state.commentItemAlice} broadcast`, ["chatItemsDeleted"])
    await waitFor("comment.pdf moved out of the archive", () => !fs.existsSync(path.join(cfg.botFiles, "comment.pdf")) && deletedNames().includes("comment.pdf"))
  })

  await step("a file with a Cyrillic name is archived intact", async () => {
    const name = "Гольбах Система природы.pdf"
    const bytes = randomFile(cfg.aliceFiles, name, 8 * 1024)
    await sendGroupFile(alice, state.groupIdAlice, name, "")
    await waitFor(`${name} in archive`, () => archivedBytes(name)?.length === bytes.length)
    if (!archivedBytes(name).equals(bytes)) throw new Error("archived bytes differ")
  })

  // ---- classes ("занятия"): schedule, announcement, files, edits, recording, private card ----
  const anHourAgo = new Date(Date.now() - 3_600_000)
  const lastClass = anHourAgo.toISOString().slice(0, 10) // the class "took place" an hour ago
  const nextClass = addDays(lastClass, 7)
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][anHourAgo.getUTCDay()]
  const hhmm = `${String(anHourAgo.getUTCHours()).padStart(2, "0")}:${String(anHourAgo.getUTCMinutes()).padStart(2, "0")}`

  await step("a member sets the weekly class schedule privately after a preview and /confirm; the group only sees the short form", async () => {
    await sendDirectText(bob, state.botContact.bob, "/schedule")
    await botSays(bob, "bob: no schedule yet", (t) => t.startsWith("No regular schedule yet.\n\nSet it: /class schedule <weekday> <hh:mm>"))
    await sendGroupText(bob, state.groupIdBob, "/spinoza schedule")
    await bob.waitGroupText("bob: no schedule in the group", (t) => t === "No regular schedule yet.", {from: cfg.botName})
    await sendGroupText(bob, state.groupIdBob, `/spinoza schedule ${weekday} ${hhmm}`) // the group cannot change it
    await sendDirectText(bob, state.botContact.bob, `/schedule ${weekday} ${hhmm}`)
    await botSays(bob, "bob: schedule preview", (t) => t.startsWith("NEW SCHEDULE\n\nEvery ") && t.includes(`at ${hhmm}\nTime zone: UTC\n\nNext class:\n${dmy(nextClass)}, ${hhmm}\n\nApply: /confirm\nDrop: /drop`))
    await sendDirectText(bob, state.botContact.bob, "/drop")
    await botSays(bob, "bob: preview dropped", (t) => t === "Dropped, nothing changed.")
    await sendDirectText(bob, state.botContact.bob, "/drop")
    await botSays(bob, "bob: nothing to drop", (t) => t === "Nothing to drop.\n\nPreviews come from: /class schedule, /class move, /class cancel, /vote")
    await sendDirectText(bob, state.botContact.bob, "/schedule")
    await botSays(bob, "bob: still no schedule", (t) => t.startsWith("No regular schedule yet.\n\nSet it: /class schedule <weekday> <hh:mm>"))
    await sendDirectText(bob, state.botContact.bob, `/schedule ${weekday} ${hhmm}`)
    await botSays(bob, "bob: schedule preview again", (t) => t.startsWith("NEW SCHEDULE\n\nEvery ") && t.includes(`at ${hhmm}\n`))
    await sendDirectText(bob, state.botContact.bob, "/class confirm") // the section's own confirmation word
    await botSays(bob, "bob: schedule set", (t) => t.startsWith("Schedule changed: every") && t.includes(`at ${hhmm}.\nNext class: ${dmy(nextClass)}, ${hhmm}.`))
    await sendDirectText(bob, state.botContact.bob, "/class schedule")
    await botSays(bob, "bob: schedule shown", (t) => t.startsWith("SCHEDULE\n\nEvery ") && t.includes(`at ${hhmm}\nTime zone: UTC\n\nNext class:\n${dmy(nextClass)}, ${hhmm}`) && t.endsWith("Help: /class ?"))
    await sendGroupText(bob, state.groupIdBob, "/spinoza schedule")
    await bob.waitGroupText("bob: schedule in the group", (t) => t.startsWith("SCHEDULE\n\nEvery ") && t.includes(`at ${hhmm}\nNext class: ${dmy(nextClass)}, ${hhmm}`), {from: cfg.botName})
  })

  await step("a post marked /class becomes the next class; a file replied to it is saved and put on the card", async () => {
    const post = await sendGroupText(bob, state.groupIdBob, "/spinoza class Substance\nRead E1p1-E1p10")
    state.classPostItemBob = post.chatItems[0].chatItem.meta.itemId
    await bob.waitGroupText("bob: class recorded", (t) => t === `Post tied to the class of ${dmy(nextClass)}, ${hhmm}.`, {from: cfg.botName})
    state.reading = randomFile(cfg.aliceFiles, "reading.pdf", 4 * 1024)
    // alice replies to bob's post with the reading; she needs bob's post's id in her own database
    const postOnAlice = await alice.waitEvent("alice: sees bob's class post", (e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.content?.msgContent?.text?.startsWith("/spinoza class Substance")))
    const aliceItemId = postOnAlice.chatItems.find(({chatItem}) => chatItem.content?.msgContent?.text?.startsWith("/spinoza class Substance")).chatItem.meta.itemId
    await sendGroupFile(alice, state.groupIdAlice, "reading.pdf", "", {quotedItemId: aliceItemId})
    await waitFor("reading.pdf in the archive root", () => fs.existsSync(path.join(cfg.botFiles, "reading.pdf")) && fs.readFileSync(path.join(cfg.botFiles, "reading.pdf")).equals(state.reading))
    if (fs.existsSync(path.join(cfg.botFiles, nextClass))) throw new Error("a class folder was created")
    await alice.waitGroupText("alice: file confirmed for the class", (t) => t === `Saved to the class of ${dmy(nextClass)}: reading.pdf`, {from: cfg.botName})
  })

  await step("a member follows classes, the post is edited, the card shows the edit and a notification arrives", async () => {
    await sendDirectText(bob, state.botContact.bob, "/watch on")
    await botSays(bob, "bob: following", (t) => t.startsWith("Notifications about classes are on"))
    await bob.expect(`/_update item #${state.groupIdBob} ${state.classPostItemBob} json ${JSON.stringify({msgContent: {type: "text", text: "/spinoza class Substance\nRead E1p1-E1p12"}, mentions: {}})}`, ["chatItemUpdated"])
    await waitFor("card shows the edited homework", async () => {
      await sendDirectText(bob, state.botContact.bob, "/дз")
      const card = await botSays(bob, "bob: homework card", (t) => t.startsWith(`NEXT CLASS\n\n${dmy(nextClass)}, ${hhmm}\nTopic: Substance\n`) && t.includes("Read E1p1-E1p12"), 20_000) // the card, not a follower note ("Class <date>: ...")
      return card.includes("Read E1p1-E1p12") && card.includes("edited") && card.includes("\nFiles:\n1. reading.pdf\n") && card.includes("Receive: /д <number>") ? card : null
    }, 30_000)
    await sendDirectText(bob, state.botContact.bob, "/д 1") // the card's number, one letter
    await bob.waitFileOffer("reading.pdf", "directRcv", 120_000)
    await botSays(bob, "bob: change notification", (t) => t.startsWith(`Class ${dmy(nextClass)}:`) && t.includes("homework edited") && t.endsWith(`Details: /class ${shortDate(nextClass)}`), 30_000)
  })

  await step("a recording posted after the class is kept like any file and filed with the class once someone comments prius; members list and fetch class files", async () => {
    const lecture = randomFile(cfg.aliceFiles, "lecture.mp3", 4 * 1024)
    await sendGroupFile(alice, state.groupIdAlice, "lecture.mp3", "")
    await bob.waitFileOffer("lecture.mp3", "groupRcv")
    await waitFor("lecture.mp3 kept before prius", () => archivedBytes("lecture.mp3")?.length === lecture.length)
    await sendGroupText(bob, state.groupIdBob, "prius")
    await bob.waitGroupText("bob: recording filed", (t) => t === `Saved to the class of ${dmy(lastClass)}: lecture.mp3`, {from: cfg.botName})
    await waitFor("lecture.mp3 in the archive root", () => fs.existsSync(path.join(cfg.botFiles, "lecture.mp3")) && fs.readFileSync(path.join(cfg.botFiles, "lecture.mp3")).equals(lecture))
    if (fs.existsSync(path.join(cfg.botFiles, lastClass))) throw new Error("a class folder was created")
    await sendDirectText(bob, state.botContact.bob, "/classes")
    const list = await botSays(bob, "bob: classes list", (t) => t.startsWith("CLASSES\n\nUpcoming:\n"))
    if (!list.includes(`${shortDate(nextClass)}, ${hhmm} · Substance · 1 post · 1 file`) || !list.includes(`\nRecent:\n${shortDate(lastClass)} · recording`) || !list.endsWith("Archive: /class list archive\nHelp: /class ?")) throw new Error(`list: ${list}`)
    await sendDirectText(bob, state.botContact.bob, "/classes archive")
    await botSays(bob, "bob: classes archive", (t) => t.startsWith(`CLASS ARCHIVE\n\n${nextClass.slice(0, 4)} · `) && t.includes("Open a year: /class list "))
    await sendDirectText(bob, state.botContact.bob, `/class list ${nextClass.slice(5, 7)}.${nextClass.slice(0, 4)}`)
    await botSays(bob, "bob: classes of the month", (t) => t.startsWith("CLASSES · ") && t.includes(`${shortDate(nextClass)}, ${hhmm} · next · Substance · 1 post · 1 file`))
    await sendDirectText(bob, state.botContact.bob, `/class ${lastClass.slice(8, 10)}.${lastClass.slice(5, 7)}`)
    await botSays(bob, "bob: past class card", (t) => t.startsWith(`CLASS · past\n\n${dmy(lastClass)}, ${hhmm}\n\nRecording:\n1. lecture.mp3`))
    await sendDirectText(bob, state.botContact.bob, "/get reading.pdf")
    const offer = await bob.waitFileOffer("reading.pdf", "directRcv", 120_000)
    await bob.expect(`/freceive ${offer.chatItem.file.fileId} approved_relays=on`, ["rcvFileAccepted"], 60_000)
    const done = await bob.waitEvent("bob: reading downloaded", (e) => e.type === "rcvFileComplete" && e.chatItem.chatItem.file.fileId === offer.chatItem.file.fileId, 120_000)
    if (!fs.readFileSync(path.join(cfg.bobFiles, path.basename(done.chatItem.chatItem.file.fileSource.filePath))).equals(state.reading)) throw new Error("downloaded class file differs")
    await sendDirectText(bob, state.botContact.bob, "/list")
    const listing = await botSays(bob, "bob: numbered list, class files among the others", (t) => t.startsWith("FILES · ") && t.includes("\n1. lecture.mp3 · ") && t.includes("\n2. reading.pdf · "))
    if (listing.includes(`${nextClass}/`) || listing.includes(`${lastClass}/`)) throw new Error(`class folders shown: ${listing}`)
    await sendDirectText(bob, state.botContact.bob, "/get 1")
    await bob.waitFileOffer("lecture.mp3", "directRcv", 120_000)
    await sendDirectText(bob, state.botContact.bob, "/get 99")
    await botSays(bob, "bob: no such number", (t) => t.startsWith("There is no number 99 in the list - it has "))
    await sendDirectText(carol, state.botContact.carol, "/дз")
    await botSays(carol, "carol: homework refused", (t) => t.includes("only members"))
  })

  await step("a file archived earlier is put on the card, without moving, when a /spinoza class reply points at it", async () => {
    const handout = randomFile(cfg.aliceFiles, "handout.pdf", 4 * 1024)
    await sendGroupFile(alice, state.groupIdAlice, "handout.pdf", "a handout for the class") // a caption: the post counts on the card
    await waitFor("handout.pdf in the archive root", () => archivedBytes("handout.pdf")?.length === handout.length)
    const onBob = await bob.waitEvent("bob: sees handout.pdf", (e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.file?.fileName === "handout.pdf"))
    const itemId = onBob.chatItems.find(({chatItem}) => chatItem.file?.fileName === "handout.pdf").chatItem.meta.itemId
    await sendGroupText(bob, state.groupIdBob, "/spinoza class", {quotedItemId: itemId})
    await bob.waitGroupText("bob: handout attached", (t) => t === `Post tied to the class of ${dmy(nextClass)}, ${hhmm}.`, {from: cfg.botName})
    await sendDirectText(bob, state.botContact.bob, "/дз")
    await botSays(bob, "bob: card lists the handout", (t) => t.startsWith("NEXT CLASS\n\n") && t.includes("\n2. handout.pdf\n"))
    if (!fs.existsSync(path.join(cfg.botFiles, "handout.pdf")) || fs.existsSync(path.join(cfg.botFiles, nextClass))) throw new Error("handout.pdf left the archive root")
  })

  const movedDate = addDays(nextClass, 1)
  const followingDate = addDays(nextClass, 7)
  await step("a member moves the next class to another day and time: card and list follow, the files stay put", async () => {
    const [, mm, dd] = movedDate.split("-")
    await sendDirectText(bob, state.botContact.bob, `/move ${dd}.${mm} 20:30`) // moving is a private command
    await botSays(bob, "bob: move preview", (t) => t === `Move the class of ${dmy(nextClass)}, ${hhmm} to ${dmy(movedDate)}, 20:30?\n\nIts homework and files move along.\n\nConfirm: /confirm\nDrop: /drop`)
    if (JSON.parse(fs.readFileSync(path.join(cfg.botState, "sessions.json"), "utf8")).sessions[movedDate]) throw new Error("moved before the confirmation")
    await sendDirectText(bob, state.botContact.bob, "/confirm")
    await bob.waitGroupText("bob: class moved", (t) => t === `Class ${dmy(nextClass)} moved to ${dmy(movedDate)}, 20:30. Its homework and files moved along.`, {from: cfg.botName})
    await botSays(bob, "bob: move echoed privately with the group's name", (t) => t === `Class ${dmy(nextClass)} moved to ${dmy(movedDate)}, 20:30. Its homework and files moved along. Announced in the group "${cfg.group}".`)
    for (const name of ["reading.pdf", "handout.pdf"]) if (!fs.existsSync(path.join(cfg.botFiles, name))) throw new Error(`${name} left the archive root`)
    if (fs.readdirSync(cfg.botFiles).some((n) => !n.startsWith(".") && fs.statSync(path.join(cfg.botFiles, n)).isDirectory())) throw new Error("a folder appeared in the archive") // .outbox: copies of files being sent
    await sendDirectText(bob, state.botContact.bob, "/classes")
    const list = await botSays(bob, "bob: classes after the move", (t) => t.startsWith("CLASSES\n\nUpcoming:\n") && t.includes(`${shortDate(nextClass)} · moved to ${shortDate(movedDate)}`))
    if (!list.includes(`${shortDate(movedDate)}, 20:30 · Substance · 2 posts · 2 files`)) throw new Error(`list: ${list}`)
    await sendDirectText(bob, state.botContact.bob, "/занятие")
    await botSays(bob, "bob: moved card", (t) => t.startsWith(`NEXT CLASS\n\n${dmy(movedDate)}, 20:30\nTopic: Substance\nMoved from ${dmy(nextClass)}\n`) && t.includes("\n1. reading.pdf\n"))
    await sendDirectText(bob, state.botContact.bob, "/schedule")
    await botSays(bob, "bob: schedule with the move", (t) => t.startsWith("SCHEDULE\n\nEvery ") && t.includes(`\n\nNext class:\n${dmy(movedDate)}, 20:30 (moved from ${dmy(nextClass)})\n\nExceptions:\n${dmy(nextClass)} · moved to ${dmy(movedDate)}, 20:30`))
  })

  await step("a member cancels the class privately after confirming: the group is told, materials go to the following class", async () => {
    await sendDirectText(bob, state.botContact.bob, "/cancel")
    await botSays(bob, "bob: cancel asks for confirmation", (t) => t.startsWith(`Cancel the class of ${dmy(movedDate)}, 20:30?`) && t.includes(`will move to the class of ${dmy(followingDate)}, ${hhmm}.\n\nConfirm: /confirm\nDrop: /drop`))
    if (JSON.parse(fs.readFileSync(path.join(cfg.botState, "sessions.json"), "utf8")).sessions[movedDate].status !== "planned") throw new Error("cancelled before the confirmation")
    await sendDirectText(bob, state.botContact.bob, "/confirm")
    const expected = `Class ${dmy(movedDate)} is cancelled. Its homework and files moved to ${dmy(followingDate)}.`
    await botSays(bob, "bob: cancel confirmed privately", (t) => t === `${expected} Announced in the group "${cfg.group}".`)
    await bob.waitGroupText("bob: cancel announced in the group", (t) => t === expected, {from: cfg.botName})
    await sendDirectText(bob, state.botContact.bob, "/classes")
    const list = await botSays(bob, "bob: classes after the cancel", (t) => t.startsWith("CLASSES\n\nUpcoming:\n") && t.includes(`${shortDate(nextClass)} · moved to ${shortDate(followingDate)}`))
    if (!list.includes(`${shortDate(followingDate)}, ${hhmm} · Substance · 2 posts · 2 files`) || list.includes(shortDate(movedDate))) throw new Error(`list: ${list}`)
    await botSays(bob, "bob: cancel notification", (t) => t.startsWith(`Class ${dmy(followingDate)}:`) && t.includes(`class ${dmy(movedDate)} cancelled`), 30_000)
  })

  await step("the group is reminded 30 minutes before a class", async () => {
    const soon = new Date(Date.now() + 2 * 60_000)
    const day = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][soon.getUTCDay()]
    const soonHhmm = `${String(soon.getUTCHours()).padStart(2, "0")}:${String(soon.getUTCMinutes()).padStart(2, "0")}`
    await sendDirectText(bob, state.botContact.bob, `/schedule ${day} ${soonHhmm}`)
    await botSays(bob, "bob: schedule preview for today", (t) => t.startsWith("NEW SCHEDULE\n\nEvery ") && t.includes(`at ${soonHhmm}\n`) && t.includes(`\nStays as it is:\n${dmy(followingDate)}, ${hhmm}\n`)) // the class with the materials is not moved by the new rule
    await sendDirectText(bob, state.botContact.bob, "/confirm")
    await botSays(bob, "bob: schedule changed", (t) => t.startsWith("Schedule changed: every") && t.includes(`at ${soonHhmm}.`) && t.includes(`The class of ${dmy(followingDate)}, ${hhmm} stays as it is.`))
    await bob.waitGroupText("bob: reminder", (t) => t === "The class starts in 30 minutes.", {from: cfg.botName})
  })

  await step("a poll: drafted privately, published after confirmation, voted with a reaction, the message edited, closed; without --days no deadline, only 8 days without votes", async () => {
    await sendDirectText(bob, state.botContact.bob, "/vote")
    await botSays(bob, "bob: no polls yet", (t) => t.startsWith("No active polls."))
    await sendDirectText(bob, state.botContact.bob, "/vote When shall we meet? | Monday 18:30 | Tuesday 18:30 --days 3")
    await botSays(bob, "bob: poll preview", (t) => t.startsWith("NEW POLL\n\nWhen shall we meet?") && t.includes("👍 Monday 18:30") && t.includes("Duration: 3 days") && t.endsWith("Confirm: /confirm\nDrop: /drop"))
    await sleep(2000)
    if (alice.events.some((e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.content?.msgContent?.text?.startsWith("POLL #")))) throw new Error("published before the confirmation")
    await sendDirectText(bob, state.botContact.bob, "/confirm") // the one confirmation word, for polls too
    await botSays(bob, "bob: poll published", (t) => t === 'Poll #1 is published in the group "filedrop".\n\nOpen: /vote 1\nClose early: /vote close 1')
    const onAlice = await alice.waitEvent("alice: poll message", (e) => e.type === "newChatItems" && e.chatItems.some(({chatItem}) => chatItem.content?.msgContent?.text?.startsWith("POLL #1\n\nWhen shall we meet?")))
    const pollItem = onAlice.chatItems.find(({chatItem}) => chatItem.content?.msgContent?.text?.startsWith("POLL #1")).chatItem
    if (!pollItem.content.msgContent.text.includes("Choose one option with a reaction.")) throw new Error(`poll text: ${pollItem.content.msgContent.text}`)
    await alice.expect(`/_reaction #${state.groupIdAlice} ${pollItem.meta.itemId} on ${JSON.stringify({type: "emoji", emoji: "👍"})}`, ["chatItemReaction"])
    await bob.waitEvent("bob: poll message edited with the vote", (e) => e.type === "chatItemUpdated" && e.chatItem?.chatItem?.content?.msgContent?.text?.includes("👍 Monday 18:30 · 1") && e.chatItem.chatItem.content.msgContent.text.includes("\n1 vote\n"), 30_000)
    await sendDirectText(bob, state.botContact.bob, "/vote 1")
    await botSays(bob, "bob: poll state", (t) => t.startsWith("POLL #1\n") && t.includes("\n1 vote\n") && t.includes("Close early: /vote close 1"))
    await sendDirectText(bob, state.botContact.bob, "/г з 1") // = /vote close 1
    await botSays(bob, "bob: poll closed", (t) => t.startsWith("Poll #1 is closed.") && t.includes("👍 Monday 18:30 · 1 · chosen"))
    await alice.waitEvent("alice: closed poll message", (e) => e.type === "chatItemUpdated" && e.chatItem?.chatItem?.content?.msgContent?.text?.startsWith("POLL #1 · CLOSED"), 30_000)
    await sendDirectText(bob, state.botContact.bob, "/vote history")
    await botSays(bob, "bob: poll history", (t) => t.startsWith("POLL HISTORY · 1\n\n1  When shall we meet?\n   1 vote · "))
    await sendDirectText(bob, state.botContact.bob, "/vote Where shall we read? | Library | Cafe") // no --days: no deadline
    await botSays(bob, "bob: open-ended poll preview", (t) => t.startsWith("NEW POLL\n\nWhere shall we read?") && t.includes("\nDuration: no limit; closes after 8 days without a vote\n") && !t.includes("Closes:") && t.endsWith("Confirm: /confirm\nDrop: /drop"))
    await sendDirectText(bob, state.botContact.bob, "/drop")
    await botSays(bob, "bob: preview dropped", (t) => t === "Dropped, nothing changed.")
  })

  await step("bob deletes the chat with the bot; conatus in a group without direct messages: the file in the group and a one-time link - nothing else", async () => {
    await alice.expect(`/set direct #${cfg.group} off`, ["groupUpdated"])
    await sleep(2000) // the bot learns the group's new preferences
    await bob.expect(`/_delete @${state.botContact.bob} full notify=on`, ["contactDeleted"])
    await sleep(3000) // the bot learns about the deletion and drops its dead copy of the contact
    const before = bob.events.length
    const asked = await sendGroupText(bob, state.groupIdBob, "conatus", {quotedItemId: state.reportItemBob})
    const link = await bob.waitGroupText("bob: one-time link", (t) => t.startsWith("One-time link for a private chat:\n"), {from: cfg.botName})
    if (!/\n(https?:\/\/|simplex:)\S+$/.test(link)) throw new Error(`link: ${link}`)
    await sleep(2000)
    if (botGroupTexts(bob, before).length !== 1) throw new Error(`more than the link in the group: ${JSON.stringify(botGroupTexts(bob, before))}`)
    await waitAfter(bob, before, "bob: report.pdf posted again in the group", groupFileFromBot("report.pdf"), 60_000)
    if (botGroupFiles(bob, before).length !== 1) throw new Error(`group copies: ${JSON.stringify(botGroupFiles(bob, before))}`)
    if (!asked) throw new Error("conatus not sent")
  })

  await step("/spinoza opens a new private chat through the group once direct messages are on; the member link survives", async () => {
    await alice.expect(`/set direct #${cfg.group} on`, ["groupUpdated"]) // the group must allow direct messages between members
    await sendGroupText(bob, state.groupIdBob, "/spinoza")
    await bob.waitGroupText("bob: chat request announced", (t) => t === "I sent you a request for a private chat - accept it in your chat list, the help arrives there.", {from: cfg.botName})
    const request = await bob.waitEvent("bob: chat request from the bot", (e) => e.type === "newMemberContactReceivedInv" && e.contact.contactId !== state.botContact.bob, 60_000)
    await bob.expect(`/_accept member contact @${request.contact.contactId}`, ["memberContactAccepted"], 60_000)
    const connected = await bob.waitEvent("bob: reconnected to the bot", (e) => e.type === "contactConnected" && e.contact.localDisplayName.startsWith(cfg.botName) && e.contact.contactId !== state.botContact.bob, 90_000)
    state.botContact.bob = connected.contact.contactId
    await botSays(bob, "bob: help as the first message", (t) => /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\nI keep the group's files/.test(t) && t.includes("\nIn the group:\n") && t.endsWith("/spinoza - this help into the private chat"))
    await botSays(bob, "bob: greeted as a member", (t) => /^[A-Z][^\n]*\n\[Э[^\]]+\]\n\nI keep the group's files/.test(t) && t.endsWith("Commands shorten to one letter: /f, /c, /v, /e, /w.\nEvery command: /??")) // the greeting is the short help
    await sendDirectText(bob, state.botContact.bob, "/дз")
    await botSays(bob, "bob: member commands work in the new chat", (t) => t.startsWith("NEXT CLASS\n\n") || t.startsWith("CLASS · "))
  })

  await step("conatus from a member without a private chat: the bot opens one naming the file, the file follows once it is accepted; report.pdf was posted in the group minutes ago, so not again", async () => {
    await bob.expect(`/_delete @${state.botContact.bob} full notify=on`, ["contactDeleted"])
    await sleep(3000)
    const before = bob.events.length
    await sendGroupText(bob, state.groupIdBob, "conatus", {quotedItemId: state.reportItemBob})
    const request = await waitAfter(bob, before, "bob: chat request naming the file", (e) => e.type === "newMemberContactReceivedInv", 60_000)
    await waitAfter(bob, before, "bob: the request says which file comes", directText((t) => t === "You asked for report.pdf - it comes here as soon as you accept this chat."))
    await bob.expect(`/_accept member contact @${request.contact.contactId}`, ["memberContactAccepted"], 60_000)
    const connected = await waitAfter(bob, before, "bob: connected to the bot again", (e) => e.type === "contactConnected" && e.contact.localDisplayName.startsWith(cfg.botName), 90_000)
    state.botContact.bob = connected.contact.contactId
    const offerEvent = await waitAfter(bob, before, "bob: report.pdf privately", directFileOffer("report.pdf"), 120_000)
    const offer = offerEvent.chatItems.find(({chatItem}) => chatItem.file?.fileName === "report.pdf")
    await bob.expect(`/freceive ${offer.chatItem.file.fileId} approved_relays=on`, ["rcvFileAccepted"], 60_000)
    const done = await waitAfter(bob, before, "bob: report.pdf downloaded", (e) => e.type === "rcvFileComplete" && e.chatItem.chatItem.file.fileId === offer.chatItem.file.fileId, 120_000)
    if (!fs.readFileSync(path.join(cfg.bobFiles, path.basename(done.chatItem.chatItem.file.fileSource.filePath))).equals(state.report)) throw new Error("bytes differ")
    if (botGroupTexts(bob, before).length !== 0) throw new Error(`the bot spoke in the group: ${JSON.stringify(botGroupTexts(bob, before))}`)
    if (botGroupFiles(bob, before).length !== 0) throw new Error(`posted again within the window: ${JSON.stringify(botGroupFiles(bob, before))}`)
    // the bot dropped bob's dead contacts (and the CLI the files of those chats) several times: the archive must not lose a file
    for (const name of ["report.pdf", "reading.pdf", "lecture.mp3", "handout.pdf"]) if (!archiveNames().includes(name)) throw new Error(`${name} vanished from the archive: ${archiveNames()}`)
  })

  await step("the admin makes the bot join another group via its link", async () => {
    const g = await alice.expect(`/g ${cfg.group}-linked`, ["groupCreated"])
    const created = await alice.expect(`/create link #${cfg.group}-linked`, ["groupLinkCreated"])
    const link = created.groupLink?.connLinkContact?.connShortLink ?? created.groupLink?.connLinkContact?.connFullLink ?? created.connLinkContact?.connShortLink ?? created.connLinkContact?.connFullLink
    if (!link) throw new Error(`no link in groupLinkCreated: ${JSON.stringify(created).slice(0, 300)}`)
    await sendDirectText(alice, state.botContact.alice, `/join ${link}`)
    await botSays(alice, "alice: joining reply", (t) => t.startsWith("Connecting") && t.includes("I join automatically"))
    await waitMemberConnected(alice, g.groupInfo.groupId, cfg.botName) // host-side events differ for link joins; the member list is authoritative
    await sendDirectText(alice, state.botContact.alice, `/join ${link}`)
    await botSays(alice, "alice: already a member", (t) => t.startsWith("I am already a member"))
  })

  await step("the admin lists admins and creates a one-time invitation", async () => {
    await sendDirectText(alice, state.botContact.alice, "/admins")
    await botSays(alice, "alice: admins", (t) => t.startsWith("ADMINS\n\nalice · since ") && t.endsWith("Remove: /unadmin <name>"))
    await sendDirectText(alice, state.botContact.alice, "/invite")
    const text = await botSays(alice, "alice: invite", (t) => t.startsWith("One-time invitation"))
    const link = text.split("\n").pop().trim()
    // a fourth user could use it; we verify it is a usable invitation by having carol connect through it
    await carol.expect(`/c ${link}`, ["sentConfirmation", "sentInvitation"], 60_000)
    await carol.waitEvent("carol: connected via invitation", (e) => e.type === "contactConnected" && e.contact.localDisplayName.startsWith(cfg.botName), 60_000)
  })

  for (const p of peers) p.close()
  log(`E2E: all ${passed} steps passed`)
  process.exit(0)
}

main().catch((e) => {
  log(`E2E: FAILED after ${passed} passing step(s): ${e.message}`)
  process.exit(1)
})
