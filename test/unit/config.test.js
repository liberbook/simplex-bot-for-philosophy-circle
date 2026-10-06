import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import {parseConfig} from "../../src/config.js"

test("defaults, environment and flags are layered in that order", () => {
  const d = parseConfig([], {})
  assert.equal(d.server, "ws://127.0.0.1:5225")
  assert.equal(d.trigger, "conatus")
  assert.equal(d.scan, 100)
  assert.equal(d.membersOnly, true)
  assert.equal(d.deletedDir, path.resolve("./deleted"))
  assert.equal(d.deletedRetentionDays, 30)
  assert.equal(d.rateLimit, 20)
  assert.equal(d.timezone, "Europe/Moscow")
  assert.equal(d.notifyDelaySeconds, 120)
  assert.equal(d.reminderMinutes, 30)
  assert.equal(parseConfig(["--timezone", "UTC"], {}).timezone, "UTC")
  assert.equal(parseConfig(["--reminder-minutes", "0"], {}).reminderMinutes, 0)
  assert.equal(parseConfig([], {SPINOZA_REMINDER_MINUTES: "45"}).reminderMinutes, 45)
  assert.equal(d.maxStorage, "100gb")
  assert.equal(d.maxStorageBytes, 100 * 1024 ** 3)
  assert.deepEqual(d.adminGroupRoles, ["owner", "admin"])
  assert.equal(d.publicAddress, true)
  assert.deepEqual(d.groupLinks, [])
  assert.equal(d.language, "en", "English is the default")
  assert.equal(d.avatar, "data/avatar.png")
  assert.equal(parseConfig(["--avatar", ""], {}).avatar, "")
  assert.equal(parseConfig(["-l", "ru"], {}).language, "ru")
  assert.equal(parseConfig([], {SPINOZA_LANGUAGE: "IT"}).language, "it", "the code is case-insensitive")
  assert.throws(() => parseConfig(["-l", "de"], {}), /unknown language "de"/)
  assert.deepEqual(parseConfig(["--group-link", "https://a/g#1", "--group-link", "https://b/g#2"], {}).groupLinks, ["https://a/g#1", "https://b/g#2"])
  assert.deepEqual(parseConfig([], {SPINOZA_GROUP_LINKS: "https://a/g#1, https://b/g#2"}).groupLinks, ["https://a/g#1", "https://b/g#2"])

  const e = parseConfig([], {SPINOZA_TRIGGER: "fetch", SPINOZA_MEMBERS_ONLY: "0", SPINOZA_DIR: "/data/files", SPINOZA_SCAN: "0", SPINOZA_DELETED_DIR: "/data/deleted", SPINOZA_RATE_LIMIT: "0", SPINOZA_DELETED_RETENTION_DAYS: "7"})
  assert.equal(e.trigger, "fetch")
  assert.equal(e.membersOnly, false)
  assert.equal(e.deletedDir, "/data/deleted")
  assert.equal(e.rateLimit, 0)
  assert.equal(e.deletedRetentionDays, 7)
  assert.equal(e.dir, "/data/files")
  assert.equal(e.scan, 0)

  const f = parseConfig(["-t", "keep", "--group", "drop*", "-d", "./x"], {SPINOZA_TRIGGER: "*"})
  assert.equal(f.trigger, "keep")
  assert.equal(f.group, "drop*")
  assert.equal(f.dir, path.resolve("./x"))
})

test("config file sits between defaults and environment", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "spinoza-cfg-")), "spinoza.json")
  fs.writeFileSync(file, JSON.stringify({group: "team", maxStorage: "500mb", adminSecret: "s3cret", adminGroupRoles: [], publicAddress: false, scan: 5}))
  const c = parseConfig(["--config", file], {SPINOZA_GROUP: "from-env"})
  assert.equal(c.group, "from-env")
  assert.equal(c.maxStorageBytes, 500 * 1024 ** 2)
  assert.equal(c.adminSecret, "s3cret")
  assert.deepEqual(c.adminGroupRoles, [])
  assert.equal(c.publicAddress, false)
  assert.equal(c.scan, 5)
  assert.deepEqual(parseConfig(["--admin-group-roles", "owner"], {}).adminGroupRoles, ["owner"])
  assert.equal(parseConfig([], {SPINOZA_PUBLIC_ADDRESS: "0"}).publicAddress, false)

  fs.writeFileSync(file, JSON.stringify({unknownKey: 1}))
  assert.throws(() => parseConfig(["--config", file]), /unknown setting "unknownKey"/)
})

test("invalid values are rejected", () => {
  assert.throws(() => parseConfig(["--scan", "-1"]))
  assert.throws(() => parseConfig(["--trigger", " "]))
  assert.throws(() => parseConfig(["--trigger", "conatus save"]), /one word/)
  const star = parseConfig(["--trigger", "*"]) // the old "keep every file" setting
  assert.equal(star.trigger, "conatus")
  assert.match(star.notes[0], /every file is kept anyway/)
  assert.throws(() => parseConfig(["--max-storage", "lots"]), /invalid size/)
  assert.throws(() => parseConfig(["--dir", "/x", "--deleted-dir", "/x"]), /deletedDir must differ/)
  assert.throws(() => parseConfig(["--timezone", "Mars/Olympus"]), /unknown timezone/)
  assert.throws(() => parseConfig(["--rate-limit=-5"]), /rateLimit/)
  assert.throws(() => parseConfig(["--admin-secret", "change-me-to-a-long-random-secret"]), /example value/)
  assert.equal(parseConfig(["--help"]).help, true)
})
