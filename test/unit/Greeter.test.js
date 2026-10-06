import test from "node:test"
import assert from "node:assert/strict"
import {Greeter} from "../../src/bot/Greeter.js"
import {Citations} from "../../src/ethics/Citations.js"
import {createReplies} from "../../src/bot/replies.js"
import {silentLogger} from "../../src/util/logger.js"
import {FakeGateway, ALICE} from "./helpers.js"

const citations = new Citations([{latin: "Objectum ideae humanam Mentem constituentis est Corpus.", translation_ru: "…", source: "Ethica, II, Propositio 13", ref: "Э2т13"}])

test("a new member contact is greeted with a quotation and the first commands; a stranger with the Ethics only", async () => {
  const gateway = new FakeGateway()
  await new Greeter({gateway, citations, access: {allows: async () => true}, replies: createReplies("ru"), logger: silentLogger, sleep: async () => {}}).greet(ALICE)
  assert.deepEqual(gateway.sent[0].chat, {type: "direct", id: 3, name: "alice"})
  // the greeting IS the short help: one block of sections for the greeting, /? and /spinoza
  assert.equal(gateway.sent[0].text, `Objectum ideae humanam Mentem constituentis est Corpus.\n[Э2т13]\n\n${createReplies("ru").helpText(false, true, false)}`)
  assert.match(gateway.sent[0].text, /\n\/уведомления - уведомления о занятиях\n\nКоманды можно сокращать до первой буквы: \/ф, \/з, \/г, \/э, \/у\.\nВсе команды: \/\?\?$/)
  await new Greeter({gateway, citations, access: {allows: async () => false}, replies: createReplies("en"), logger: silentLogger, sleep: async () => {}}).greet(ALICE)
  assert.equal(gateway.sent[1].text, "Objectum ideae humanam Mentem constituentis est Corpus.\n[Э2т13]\n\nFiles and classes are for members of the group I serve. What you can do here:\n/ethics <ID> - a passage of the Ethics. Example: /ethics E1p7\n/ethics search <text> - find text in the Ethics\n/? - this help")
})

test("the greeting waits for SimpleX to link the new contact to the group member before deciding", async () => {
  const gateway = new FakeGateway()
  let looks = 0
  const slept = []
  const access = {allows: async () => ++looks >= 3} // linked on the third look
  await new Greeter({gateway, citations, access, replies: createReplies("en"), logger: silentLogger, attempts: 8, delayMs: 250, sleep: async (ms) => slept.push(ms)}).greet(ALICE)
  assert.deepEqual(slept, [250, 250])
  assert.match(gateway.sent[0].text, /\n\/files - the saved files\n/, "greeted as a member")
  looks = -100
  slept.length = 0
  await new Greeter({gateway, citations, access, replies: createReplies("en"), logger: silentLogger, attempts: 3, delayMs: 10, sleep: async (ms) => slept.push(ms)}).greet(ALICE)
  assert.equal(slept.length, 2, "gives up after the attempts")
  assert.match(gateway.sent[1].text, /Files and classes are for members/)
})
