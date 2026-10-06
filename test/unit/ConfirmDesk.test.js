import test from "node:test"
import assert from "node:assert/strict"
import {ConfirmDesk} from "../../src/bot/ConfirmDesk.js"
import {Confirmations} from "../../src/bot/Confirmations.js"
import {createReplies} from "../../src/bot/replies.js"
import {silentLogger} from "../../src/util/logger.js"
import {FakeGateway, ALICE, directMessage, groupMessage} from "./helpers.js"

const replies = createReplies("en")

function setup({member = true} = {}) {
  const gateway = new FakeGateway()
  const confirmations = new Confirmations()
  const desk = new ConfirmDesk({gateway, confirmations, access: {allows: async () => member}, replies, logger: silentLogger})
  return {gateway, confirmations, desk, texts: () => gateway.sent.map((m) => m.text)}
}

test("/подтвердить runs the action waiting for this person and answers with its text; every section's confirm word lands here", async () => {
  const {gateway, confirmations, desk, texts} = setup()
  assert.equal(await desk.handle(directMessage("/list")), false, "not its business")
  assert.equal(await desk.handle(groupMessage({text: "/подтвердить"})), false, "private only")
  assert.equal(await desk.handle(directMessage("/подтвердить")), true)
  assert.deepEqual(texts(), ["Nothing to confirm.\n\nPreviews come from: /class schedule, /class move, /class cancel, /vote"])
  let runs = 0
  confirmations.ask(ALICE, async () => (runs++, "Done."))
  await desk.handle(directMessage("/занятие подтвердить"))
  assert.equal(runs, 1)
  assert.equal(texts().at(-1), "Done.")
  confirmations.ask(ALICE, async () => {
    runs++
    await gateway.sendText({type: "group", id: 1, name: "g"}, "announced")
  })
  await desk.handle(directMessage("/голосование подтвердить"))
  assert.equal(runs, 2)
  assert.equal(texts().at(-1), "announced", "an action that speaks for itself adds no second message")
  await desk.handle(directMessage("/confirm"))
  assert.match(texts().at(-1), /^Nothing to confirm/, "used once")
})

test("/отменить drops the waiting action - and only that; nothing waiting is said plainly", async () => {
  const {confirmations, desk, texts} = setup()
  await desk.handle(directMessage("/отменить"))
  assert.deepEqual(texts(), ["Nothing to drop.\n\nPreviews come from: /class schedule, /class move, /class cancel, /vote"])
  confirmations.ask(ALICE, () => "never")
  await desk.handle(directMessage("/голосование отменить"))
  assert.equal(texts().at(-1), "Dropped, nothing changed.")
  await desk.handle(directMessage("/подтвердить"))
  assert.match(texts().at(-1), /^Nothing to confirm/)
  assert.equal(await desk.handle(directMessage("/голосование отменить 3")), false, "with a number it is the poll's own command (cancel a published poll)")
  assert.equal(await desk.handle(directMessage("/занятие отмена")), false, "cancelling a class is the class desk's business")
})

test("a stranger is refused", async () => {
  const {desk, texts} = setup({member: false})
  assert.equal(await desk.handle(directMessage("/подтвердить")), true)
  assert.match(texts()[0], /only members/)
})
