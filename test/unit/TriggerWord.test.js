import test from "node:test"
import assert from "node:assert/strict"
import {TriggerWord} from "../../src/bot/TriggerWord.js"
import {formatSize, parseSize} from "../../src/util/format.js"

test("sizes parse and format", () => {
  assert.equal(parseSize("100gb"), 100 * 1024 ** 3)
  assert.equal(parseSize("512 MB"), 512 * 1024 ** 2)
  assert.equal(parseSize("2048"), 2048)
  assert.equal(parseSize("1.5kb"), 1536)
  assert.throws(() => parseSize("10 lightyears"))
  assert.equal(formatSize(1536), "1.5 KiB")
  assert.equal(formatSize(100 * 1024 ** 3), "100 GiB")
})

test("the fetch word is found as a whole word, case-insensitively; bare means the word alone", () => {
  const word = new TriggerWord("conatus")
  assert.equal(word.mentions("please CONATUS this"), true)
  assert.equal(word.mentions("#conatus!"), true)
  assert.equal(word.mentions("conatusque"), false)
  assert.equal(word.mentions(""), false)
  assert.equal(word.isBare(" Conatus! "), true)
  assert.equal(word.isBare("conatus у Спинозы"), false)
  assert.throws(() => new TriggerWord(""))
})
