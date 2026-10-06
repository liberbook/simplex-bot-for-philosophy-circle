import test from "node:test"
import assert from "node:assert/strict"
import {generate} from "../../scripts/interface-doc.js"
import {LANGUAGES} from "../../src/bot/replies.js"

// The generator of INTERFACE.md runs ~165 real commands through the real bot
// classes. Rendering it in every language is the broadest check a translation
// gets: every report, card, help and error of that language is built once.
for (const code of Object.keys(LANGUAGES)) {
  test(`${code}: the whole interface renders - every command, every report`, async () => {
    const {text, blocks} = await generate(code)
    assert.ok(blocks > 150, `${code}: only ${blocks} blocks`)
    assert.ok(text.length > 20_000, `${code}: the document is suspiciously short`)
    assert.doesNotMatch(text, /\$\{|\bundefined\b|\bNaN\b|\[object Object\]/, `${code}: an unfinished text reached the document`)
  })
}
