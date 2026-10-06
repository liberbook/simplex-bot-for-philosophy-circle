import test from "node:test"
import assert from "node:assert/strict"
import {ChatConnection} from "../../src/transport/ChatConnection.js"
import {Logger, silentLogger} from "../../src/util/logger.js"
import {redactSecrets} from "../../src/util/redact.js"

/** Fake WebSocket whose behaviour per attempt is scripted: "error", "error+close" or "open". */
function installFakeWebSocket(script) {
  const created = []
  class FakeWebSocket extends EventTarget {
    static OPEN = 1
    constructor(url) {
      super()
      this.url = url
      this.readyState = 0
      this.sent = []
      created.push(this)
      const behaviour = script[created.length - 1] ?? "open"
      queueMicrotask(() => {
        if (behaviour === "open") {
          this.readyState = 1
          this.dispatchEvent(new Event("open"))
        } else {
          this.dispatchEvent(new Event("error"))
          if (behaviour === "error+close") this.dispatchEvent(new Event("close"))
        }
      })
    }
    send(data) {
      this.sent.push(data)
    }
    close() {
      this.dispatchEvent(new Event("close"))
    }
  }
  const original = globalThis.WebSocket
  globalThis.WebSocket = FakeWebSocket
  return {created, restore: () => (globalThis.WebSocket = original)}
}

test("reconnects after failed connects, whether or not a close event follows the error", async () => {
  const fake = installFakeWebSocket(["error", "error+close", "open"])
  try {
    const conn = new ChatConnection("ws://test", {logger: silentLogger, reconnectMs: 5})
    let opens = 0
    conn.onOpen(() => opens++)
    await conn.start()
    assert.equal(fake.created.length, 3, "third attempt succeeded")
    assert.equal(opens, 1)
    conn.stop()
  } finally {
    fake.restore()
  }
})

test("verbose event logging never shows the admin secret", async () => {
  const fake = installFakeWebSocket(["open"])
  const lines = []
  try {
    const conn = new ChatConnection("ws://test", {logger: new Logger({verbose: true, out: {log: (l) => lines.push(l), error: (l) => lines.push(l)}, redact: redactSecrets})})
    await conn.start()
    const item = {chatInfo: {type: "direct", contact: {contactId: 3}}, chatItem: {content: {msgContent: {type: "text", text: "/admin s3cret"}}}}
    fake.created[0].dispatchEvent(Object.assign(new Event("message"), {data: JSON.stringify({resp: {type: "newChatItems", chatItems: [item]}})}))
    assert.ok(lines.some((l) => l.includes("newChatItems")))
    assert.ok(lines.every((l) => !l.includes("s3cret")), lines.join("\n"))
    conn.stop()
  } finally {
    fake.restore()
  }
})

test("correlates responses to commands and delivers events", async () => {
  const fake = installFakeWebSocket(["open"])
  try {
    const conn = new ChatConnection("ws://test", {logger: silentLogger})
    const events = []
    conn.onEvent((e) => events.push(e))
    await conn.start()
    const ws = fake.created[0]
    const reply = conn.send("/user")
    const {corrId} = JSON.parse(ws.sent[0])
    ws.dispatchEvent(Object.assign(new Event("message"), {data: JSON.stringify({resp: {type: "newChatItems", chatItems: []}})}))
    ws.dispatchEvent(Object.assign(new Event("message"), {data: JSON.stringify({corrId, resp: {type: "activeUser"}})}))
    assert.deepEqual(await reply, {type: "activeUser"})
    assert.deepEqual(events, [{type: "newChatItems", chatItems: []}])
    conn.stop()
  } finally {
    fake.restore()
  }
})

test("a listener that throws on an unexpected event shape does not stop later events", async () => {
  const fake = installFakeWebSocket(["open"])
  try {
    const conn = new ChatConnection("ws://test", {logger: silentLogger})
    const events = []
    conn.onEvent((e) => {
      if (e.type === "odd") throw new Error("unexpected shape")
      events.push(e.type)
    })
    await conn.start()
    const ws = fake.created[0]
    ws.dispatchEvent(Object.assign(new Event("message"), {data: JSON.stringify({resp: {type: "odd"}})}))
    ws.dispatchEvent(Object.assign(new Event("message"), {data: JSON.stringify({resp: {type: "newChatItems", chatItems: []}})}))
    assert.deepEqual(events, ["newChatItems"])
    conn.stop()
  } finally {
    fake.restore()
  }
})
