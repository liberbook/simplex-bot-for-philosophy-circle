import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import {EthicaIndex, RenderMode} from "../../src/ethics/EthicaIndex.js"

const index = EthicaIndex.load(path.join(import.meta.dirname, "../../data/spinoza_ethica_index_ru.json"))

test("identifiers in both alphabets convert to the Latin key", () => {
  assert.equal(EthicaIndex.toLatin("Э1т7"), "1p7")
  assert.equal(EthicaIndex.toLatin("э1т11док"), "1p11dem")
  assert.equal(EthicaIndex.toLatin("1т8сх2"), "1p8s2")
  assert.equal(EthicaIndex.toLatin("E1p7"), "1p7")
  assert.equal(EthicaIndex.toLatin("Э2аксф1"), "2physax1")
  assert.equal(EthicaIndex.toLatin("Прим12"), "note12")
})

test("lookup and rendering modes", () => {
  const t7 = index.get("Э1т7")
  assert.equal(t7.type, "теорема")
  assert.equal(t7.rid, "Э1т7")
  const basic = index.render("Э1т7")
  assert.match(basic, /^\[Э1т7\] Часть I · Теорема 7\n\n/)
  assert.match(basic, /\[Доказательство\]/)
  assert.doesNotMatch(basic, /\[Схолия/)
  const full = index.render("Э1т8", RenderMode.FULL)
  assert.match(full, /\[Схолия 1\]/)
  const all = index.render("Э1т28", RenderMode.ALL)
  assert.match(all, /УПОМЯНУТЫЕ ПОЛОЖЕНИЯ/)
  assert.ok(all.length > index.render("Э1т28", RenderMode.FULL).length, "ALL adds the passages the proof mentions")
  assert.equal(index.render("Э9т99"), null)
})

test("search, list and random theorem", () => {
  const love = index.search("любовь", {part: 3})
  assert.ok(love.length > 0)
  assert.ok(love.every((e) => e.part === 3 && e.text.toLowerCase().includes("любовь")))
  assert.ok(index.search("любовь", {part: 3, type: "теорема"}).every((e) => e.type === "теорема"))
  assert.ok(index.list(1).length > 30)
  assert.ok(index.list().length > index.list(1).length)
  const t = index.randomTheorem(() => 0)
  assert.equal(t.type, "теорема")
  assert.equal(t.rid, "Э1т1")
})

test("identifiers are decoded, unknown ones get the nearest forms, natural requests become identifiers", () => {
  const index = EthicaIndex.load(path.join(import.meta.dirname, "../../data/spinoza_ethica_index_ru.json"))
  assert.equal(index.describe(index.get("Э1т6кор1")), "Часть I · Теорема 6 · Королларий 1")
  assert.equal(index.describe(index.get("Э4приб5")), "Часть IV · Прибавление · Глава 5")
  assert.equal(index.describe(index.get("Э1приб")), "Часть I · Прибавление")
  assert.equal(index.describe(index.get("Прим24")), "Примечание 24")
  assert.equal(index.get("Прим12"), null, "notes 1-23 belonged to a modern introduction, not to the Ethics")
  assert.equal(index.describe(index.get("Э2аксф3")), "Часть II · Аксиома (о телах) 3")
  assert.equal(index.describe(index.get("Э2опрф")), "Часть II · Определение (о телах)")
  assert.equal(index.label(index.get("E1p8s2")), "[Э1т8сх2] Часть I · Теорема 8 · Схолия 2")
  assert.deepEqual(index.suggest("Э1т7кор").map((e) => e.rid), ["Э1т7", "Э1т7док"])
  assert.deepEqual(index.suggest("Э1т8схх").map((e) => e.rid).slice(0, 2), ["Э1т8", "Э1т8док"])
  assert.deepEqual(index.suggest("Э9"), [])
  assert.deepEqual(EthicaIndex.fromNatural("часть 1 теорема 7"), {ref: "Э1т7", rest: ""})
  assert.deepEqual(EthicaIndex.fromNatural("теорема 7 части 1 --полно"), {ref: "Э1т7", rest: "--полно"})
  assert.deepEqual(EthicaIndex.fromNatural("part 2 definition 3"), {ref: "Э2опр3", rest: ""})
  assert.equal(EthicaIndex.fromNatural("любовь"), null)
})
