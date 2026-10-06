import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import {Citations} from "../../src/ethics/Citations.js"
import {EthicaIndex} from "../../src/ethics/EthicaIndex.js"

const DATA = path.join(import.meta.dirname, "..", "..", "data")

test("every quotation carries Latin text, a Russian translation, a source and a reference the Ethics index resolves", () => {
  const citations = Citations.load(path.join(DATA, "spinoza_citations.json"))
  const index = EthicaIndex.load(path.join(DATA, "spinoza_ethica_index_ru.json"))
  assert.ok(citations.list().length >= 30)
  for (const c of citations.list()) {
    assert.match(c.latin, /^\S.*\S$/, `latin: ${JSON.stringify(c)}`)
    assert.ok(c.translation_ru.length > 0)
    assert.match(c.source, /^Ethica, [IV]+, /)
    assert.equal(index.get(c.ref)?.rid, c.ref, `unknown reference ${c.ref} for ${c.source}`)
  }
  assert.equal(new Set(citations.list().map((c) => c.latin)).size, citations.list().length, "no duplicates")
})

test("next() cycles through a shuffle without repeats, never the same twice in a row; long quotations are left out", () => {
  const entries = ["a", "b", "c"].map((l) => ({latin: l, translation_ru: l, source: "s", ref: "r"}))
  const citations = new Citations([...entries, {latin: "too long", translation_ru: "x", source: "s", ref: "r", show_in_spinoza_help: false}], () => 0)
  assert.equal(citations.list().length, 3)
  const shown = Array.from({length: 9}, () => citations.next().latin)
  for (let i = 0; i < 9; i += 3) assert.deepEqual([...shown.slice(i, i + 3)].sort(), ["a", "b", "c"], `cycle ${i / 3}: ${shown}`)
  for (let i = 1; i < 9; i++) assert.notEqual(shown[i], shown[i - 1], `repeat at ${i}: ${shown}`)
  assert.equal(new Citations([]).next(), null)
  const single = new Citations([entries[0]])
  assert.equal(single.next().latin, "a")
  assert.equal(single.next().latin, "a")
})
