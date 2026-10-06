import test from "node:test"
import assert from "node:assert/strict"
import {ContactBook} from "../../src/bot/ContactBook.js"
import {silentLogger} from "../../src/util/logger.js"
import {FakeGateway} from "./helpers.js"

test("cleanup removes contacts whose other side is gone and tells the other stores; state tells active from pending and gone", async () => {
  const gateway = new FakeGateway()
  gateway.contacts = [
    {contactId: 3, name: "alice", status: "active", connStatus: "ready"},
    {contactId: 4, name: "bob", status: "deleted", connStatus: "deleted"},
    {contactId: 5, name: "carol", status: "active", connStatus: "joined"},
    {contactId: 6, name: "dave", status: "deletedByUser", connStatus: "ready"},
  ]
  const forgotten = []
  const book = new ContactBook({gateway, logger: silentLogger, onForget: [(id) => forgotten.push(id)]})
  assert.equal(await book.state(3), "active")
  assert.equal(await book.state(5), "pending")
  assert.equal(await book.state(4), "gone")
  assert.equal(await book.state(99), "gone")
  assert.equal(await book.cleanup(), 2)
  assert.deepEqual(gateway.deleted, [4, 6])
  assert.deepEqual(forgotten, [4, 6])
  assert.deepEqual(gateway.contacts.map((c) => c.contactId), [3, 5])
  await book.onContactDeleted({contactId: 3, name: "alice"})
  assert.deepEqual(gateway.deleted, [4, 6, 3])
  gateway.deleteContact = async () => {
    throw new Error("boom")
  }
  assert.equal(await book.forget(5, "carol", "test"), false)
})
