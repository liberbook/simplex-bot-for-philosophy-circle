import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import {Philosopher, parseEthicsRequest, splitText} from "../../src/bot/Philosopher.js"
import {EthicaIndex} from "../../src/ethics/EthicaIndex.js"
import {createReplies, LANGUAGES} from "../../src/bot/replies.js"
import {silentLogger} from "../../src/util/logger.js"
import {FakeGateway, directMessage} from "./helpers.js"

const index = EthicaIndex.load(path.join(import.meta.dirname, "../../data/spinoza_ethica_index_ru.json"))

function philosopher(language = "ru", extra = {}) {
  const gateway = new FakeGateway()
  return {gateway, p: new Philosopher({gateway, index, replies: createReplies(language), logger: silentLogger, ...extra})}
}

test("request parsing accepts python-style flags and plain Russian/English words", () => {
  assert.deepEqual(parseEthicsRequest(""), {action: "help", ref: null, mode: "default", query: null, part: null, type: null, unknown: null})
  assert.deepEqual(parseEthicsRequest("Э1т7"), {action: "show", ref: "Э1т7", mode: "default", query: null, part: null, type: null, unknown: null})
  assert.equal(parseEthicsRequest("Э1т7 --полно").mode, "full")
  assert.equal(parseEthicsRequest("Э1т7 --связи").mode, "all")
  assert.equal(parseEthicsRequest("помощь").action, "guide")
  assert.equal(parseEthicsRequest("Э1т7 ?").action, "guide")
  assert.equal(parseEthicsRequest("пл Э1т7").mode, "full")
  assert.equal(parseEthicsRequest("вс Э1т7").mode, "all")
  assert.equal(parseEthicsRequest("о Э1т7").mode, "full", "one letter: о = полн")
  assert.equal(parseEthicsRequest("в Э1т7").mode, "all")
  assert.deepEqual([parseEthicsRequest("с 3").action, parseEthicsRequest("с 3").part], ["list", 3])
  assert.equal(parseEthicsRequest("л").action, "random")
  assert.deepEqual(parseEthicsRequest("п любовь ч 3 т схолия"), {action: "search", ref: null, mode: "default", query: "любовь", part: 3, type: "схолия", unknown: null})
  assert.equal(parseEthicsRequest("всё Э1т7").mode, "all")
  assert.equal(parseEthicsRequest("Э1т7 полная").unknown, "полная")
  assert.equal(parseEthicsRequest("п любовь --часть 3").part, 3)
  assert.equal(parseEthicsRequest("сп 2").action, "list")
  assert.equal(parseEthicsRequest("сл").action, "random")
  assert.equal(parseEthicsRequest("--full Э1т11").mode, "full")
  assert.equal(parseEthicsRequest("полн Э1т11").ref, "Э1т11")
  assert.equal(parseEthicsRequest("Э1т28 всё").mode, "all")
  assert.deepEqual(parseEthicsRequest("--search любовь --part 3"), {action: "search", ref: null, mode: "default", query: "любовь", part: 3, type: null, unknown: null})
  assert.deepEqual(parseEthicsRequest("поиск вечная любовь часть 5 тип теорема").query, "вечная любовь")
  assert.equal(parseEthicsRequest("поиск вечная любовь часть 5 тип теорема").type, "теорема")
  assert.deepEqual(parseEthicsRequest("список 2"), {action: "list", ref: null, mode: "default", query: null, part: 2, type: null, unknown: null})
  assert.deepEqual(parseEthicsRequest("с 2 теоремы"), {action: "list", ref: null, mode: "default", query: null, part: 2, type: "теорема", unknown: null}, "a type word after the part lists the entries of that type")
  assert.equal(parseEthicsRequest("список 3 аффекты").type, "определение аффекта")
  assert.equal(parseEthicsRequest("случайная").action, "random")
  assert.equal(parseEthicsRequest("поиск").action, "help")
})

test("/ethics answers in Russian by default: help, theorem, search, list, not found", async () => {
  const {gateway, p} = philosopher()
  assert.equal(await p.handle(directMessage("/list")), false)
  assert.equal(await p.handle(directMessage("/ethics")), true)
  assert.equal(gateway.sent[0].text, "СПИНОЗА, «ЭТИКА»\n\nЧитать:\n/этика Э1т7 - положение и доказательство\n/этика полн Э1т7 - добавить схолии и королларии\n/этика всё Э1т7 - также раскрыть связанные положения\n\nИскать:\n/этика поиск любовь\n\nСмотреть структуру:\n/этика список 3\n/этика случайно\n\nКоротко:\n/э Э1т7\n/э о Э1т7\n/э в Э1т7\n/э п любовь\n/э с 3\n/э л\n\nСправка: /этика ?")
  await p.handle(directMessage("/ethics Э1т7"))
  assert.match(gateway.sent[1].text, /^\[Э1т7\] Часть I · Теорема 7\n\n.*\n\n\[Доказательство\]/s)
  await p.handle(directMessage("/этика поиск любовь часть 3"))
  assert.match(gateway.sent[2].text, /^ПОИСК В «ЭТИКЕ» · любовь · часть 3 · \d+\n\nЭ3[\s\S]*\n\nОткрыть: \/этика <ID>$/, "the filter is in the heading, so no hint to narrow down by part")
  await p.handle(directMessage("/ethics список 1"))
  assert.match(gateway.sent[3].text, /^ЭТИКА · ЧАСТЬ I · 122 положения\n\nОпределения · 8\n[\s\S]*\nТеоремы · 36\n[\s\S]*\n\nПеречень: \/этика список 1 теоремы\nОткрыть: \/этика <ID>$/, "the structure of the part, not 122 lines")
  await p.handle(directMessage("/э с 1 теоремы"))
  assert.match(gateway.sent[4].text, /^ЭТИКА · ЧАСТЬ I · ТЕОРЕМЫ · 36\n\nЭ1т1 - .{1,71}\nЭ1т2 - [\s\S]*\nЭ1т36 - .*\n\nОткрыть: \/этика <ID>$/)
  gateway.sent.splice(4, 1) // keep the indexes of the following assertions
  await p.handle(directMessage("/ethics Э7т1"))
  assert.equal(gateway.sent[4].text, "Положения «Э7т1» нет.\n\nСправка: /этика ?")
  await p.handle(directMessage("/ethics random"))
  assert.match(gateway.sent[5].text, /^\[Э\dт\d+\] Часть [IV]+ · Теорема \d+/)
  await p.handle(directMessage("/э Э1т7 полная"))
  assert.equal(gateway.sent[6].text, "Не удалось распознать режим «полная».\n\nВозможно, вы имели в виду:\n/этика полн Э1т7\n/этика всё Э1т7")
  await p.handle(directMessage("/этика ?"))
  assert.match(gateway.sent[7].text, /^ИДЕНТИФИКАТОРЫ «ЭТИКИ»\n\nЭ1т7       часть I, теорема 7\n[\s\S]*\nРЕЖИМЫ\n\n\/этика <ID>\n[\s\S]*\nПОИСК\n[\s\S]*\nКОРОТКИЕ ФОРМЫ\n\n\/э <ID>\n\/э о <ID> - полн\n\/э в <ID> - всё\n\/э п <текст> - поиск \(ч <часть>, т <тип>\)\n\/э с <часть> - список\n\/э л - случайно$/)
  await p.handle(directMessage("/этика Э1т7кор"))
  assert.equal(gateway.sent[8].text, "Положения «Э1т7кор» нет.\n\nВозможные формы:\nЭ1т7 - Часть I · Теорема 7\nЭ1т7док - Часть I · Теорема 7 · Доказательство\n\nПоказать всё положение: /этика полн Э1т7")
  await p.handle(directMessage("/этика часть 1 теорема 7"))
  assert.match(gateway.sent[9].text, /^\[Э1т7\] Часть I · Теорема 7/)
  await p.handle(directMessage("/э теорема 7 части 1 --связи"))
  assert.match(gateway.sent[10].text, /^\[Э1т7\] Часть I · Теорема 7[\s\S]*УПОМЯНУТЫЕ ПОЛОЖЕНИЯ/)
})

test("long answers are split into numbered messages, English texts when configured", async () => {
  const {gateway, p} = philosopher("en", {maxChunkChars: 1500, maxChunks: 2})
  await p.handle(directMessage("/ethics all Э1т28"))
  assert.ok(gateway.sent.length >= 2)
  assert.match(gateway.sent[0].text, /\(part 1 of 2\)$/)
  assert.ok(gateway.sent.every((m) => m.text.length <= 1500 + 30))
  assert.match(gateway.sent.at(-1).text, /the rest is left out/)
  await p.handle(directMessage("/ethics"))
  assert.match(gateway.sent.at(-1).text, /^SPINOZA, "ETHICS"\n\nRead:\n/)
  await p.handle(directMessage("/ethics ?"))
  assert.match(gateway.sent.at(-1).text, /^IDENTIFIERS OF THE "ETHICS"\n/)
})

test("both languages define the same texts", () => {
  const keys = (o) => Object.keys(o).sort().join()
  assert.equal(keys(LANGUAGES.ru), keys(LANGUAGES.en))
  const citation = {latin: "Deus sive Natura.", ref: "Э4пред"}
  assert.match(createReplies("ru", {triggerWord: "conatus"}).groupGreetingText(citation), /^Deus sive Natura\.\n\[Э4пред\]\n\nкаждый файл группы хранится в архиве\nconatus - ответом на файл или сразу после него: выложу файл в группу и пришлю вам лично\n/)
  assert.match(createReplies("ru").groupGreetingText(null), /^каждый файл группы хранится в архиве\nconatus - /) // conatus is the default word
  assert.match(createReplies("en", {triggerWord: "fetch"}).groupGreetingText(citation), /\nfetch - as a reply to a file or right after it: I post the file in the group and send it to you privately\n/)
  assert.throws(() => createReplies("de"), /unsupported language/)
})

test("splitText respects paragraph boundaries", () => {
  const text = Array.from({length: 30}, (_, i) => `paragraph ${i} ${"x".repeat(80)}`).join("\n\n")
  const chunks = splitText(text, 500)
  assert.ok(chunks.length > 3)
  assert.ok(chunks.every((c) => c.length <= 500))
  assert.equal(chunks.join("\n\n"), text)
})
