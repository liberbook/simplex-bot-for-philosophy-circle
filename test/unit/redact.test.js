import test from "node:test"
import assert from "node:assert/strict"
import {redactSecrets} from "../../src/util/redact.js"

test("the admin secret is hidden in every form it may reach a log", () => {
  assert.equal(redactSecrets("/admin s3cret"), "/admin ***")
  assert.equal(redactSecrets("admin s3cret with spaces"), "admin ***")
  assert.equal(redactSecrets("/админ пароль"), "/админ ***")
  assert.equal(redactSecrets('{"text":"/admin s3cret","x":1}'), '{"text":"/admin ***","x":1}')
  assert.equal(redactSecrets("alice: unknown /admin s3cret\nnext line"), "alice: unknown /admin ***\nnext line")
})

test("other texts are left alone", () => {
  for (const s of ["/admins", "alice (admin): delete x.pdf", "administrator", "/list *.pdf", "sam requested admin access: granted"]) {
    assert.equal(redactSecrets(s), s)
  }
})
