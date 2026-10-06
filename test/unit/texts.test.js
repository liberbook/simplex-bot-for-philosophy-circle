import test from "node:test"
import assert from "node:assert/strict"
import {DEFAULT_LANGUAGE, LANGUAGE_CODES, LANGUAGES, createReplies} from "../../src/bot/replies.js"
import {ClassSchedule} from "../../src/domain/ClassSchedule.js"

const ru = createReplies("ru")
const en = createReplies("en")
const saturday = ClassSchedule.parse("сб 12:15", "Europe/Moscow")
const file = (name, size, day = "2026-09-08") => ({name, size, modifiedAt: new Date(`${day}T10:00:00Z`)})

test("Russian reports: storage without repeated words or zeros, sizes with a decimal comma, proper plurals", () => {
  const usage = {used: 148 * 1024 ** 2, limit: 10 * 1024 ** 3, free: 10 * 1024 ** 3 - 148 * 1024 ** 2, reserved: 0, diskFree: 175 * 1024 ** 3}
  assert.equal(ru.spaceText(usage, {count: 2, bytes: 1007 * 1024 ** 2, retentionMs: 30 * 86_400_000}), "ХРАНИЛИЩЕ\n\nАрхив: 148 MiB из 10 GiB\nСвободно в архиве: 9,9 GiB\n\nКорзина: 1007 MiB · 2 файла\nСрок хранения: 30 дней\n\nСвободно на диске: 175 GiB\n\nКорзина: /корзина\nСправка: /файлы ?")
  assert.equal(ru.spaceText({...usage, reserved: 5 * 1024 ** 2, diskFree: null}, {count: 0, bytes: 0, retentionMs: 0}), "ХРАНИЛИЩЕ\n\nАрхив: 148 MiB из 10 GiB\nСвободно в архиве: 9,9 GiB\nЗагружается сейчас: 5,0 MiB\n\nКорзина пуста\n\nКорзина: /корзина\nСправка: /файлы ?")
  assert.equal(ru.spaceText(usage, {count: 1, bytes: 1024, retentionMs: 86_400_000}).split("\n").slice(5, 7).join("\n"), "Корзина: 1,0 KiB · 1 файл\nСрок хранения: 1 день")
  assert.equal(ru.spaceText(usage, {count: 5, bytes: 1024, retentionMs: 3 * 86_400_000}).split("\n").slice(5, 7).join("\n"), "Корзина: 1,0 KiB · 5 файлов\nСрок хранения: 3 дня")
  assert.equal(ru.statusText({name: "spinoza", version: "1.1.0", uptimeMs: 3_600_000 * 3 + 12 * 60_000, groups: [{title: "Ethics"}], fileCount: 21, usage, deleted: {count: 0, bytes: 0}, schedule: saturday, classCount: 3, unknownCommands: []}), "СОСТОЯНИЕ\n\nspinoza 1.1.0 · работает 3 ч 12 мин\nГруппы: Ethics\nАрхив: 21 файл · 148 MiB из 10 GiB\nКорзина пуста\nЗанятий: 3\nРасписание: каждую субботу в 12:15\n\nХранилище: /место")
})

test("Russian file list: heading, dots, hidden class folder, shortened long names, flagged empty files", () => {
  const files = [file("Uno.flac", 11 * 1024 ** 2), file("Access to Arasaka - l a k e s - 01 EL54.flac", 38 * 1024 ** 2), file("Гольбах. Избранные произведения, том 1.pdf", 0, "2026-09-07")]
  assert.equal(
    ru.listText(files, "", 3500),
    "ФАЙЛЫ · 3 · новые сверху\n\n1. Uno.flac · 11 MiB · 08.09.2026\n2. Access to Arasaka - l a k e s - 01 EL54…flac · 38 MiB · 08.09.2026\n3. Гольбах. Избранные произведения, том 1.pdf · 0 B · файл пуст или не был загружен полностью\n\nПолучить: /дай <номер>\nФильтр: /файлы <шаблон>\nСправка: /файлы ?"
  )
  assert.equal(ru.listText(files.slice(0, 1), "*.flac", 3500).split("\n")[0], "ФАЙЛЫ · 1 · шаблон *.flac · новые сверху")
  assert.equal(ru.listText([], "*.pdf", 3500), "По шаблону «*.pdf» файлов нет.\n\nСписок: /файлы")
  assert.match(ru.listText(Array.from({length: 200}, (_, i) => file(`file-${i}.pdf`, 1024)), "", 600), /\n… и ещё \d+ - уточните: \/файлы <шаблон>\n\nПолучить: \/дай <номер>/)
  assert.equal(ru.deletedListText(files.slice(0, 1), 3500), "КОРЗИНА · 1 · новые сверху\n\n1. Uno.flac · 11 MiB · 08.09.2026\n\nВернуть: /восстановить <номер>\nСправка: /файлы ?")
  assert.equal(ru.getUsageText(), "Укажите номер или имя файла.\n\nПример: /дай 3\nСписок: /файлы")
})

test("Russian schedule: shown compactly with time zone and exceptions; previewed before a change; moves previewed with concrete dates", () => {
  const outlook = {next: {date: "2026-09-19", time: "12:15", movedFrom: null}, changes: [{kind: "cancelled", date: "2026-09-12", to: "2026-09-19"}, {kind: "moved", date: "2026-09-26", to: "2026-09-27", time: "20:00"}, {kind: "time", date: "2026-10-03", time: "13:00"}]}
  assert.equal(ru.scheduleShowText(saturday, outlook), "РАСПИСАНИЕ\n\nКаждую субботу в 12:15\nЧасовой пояс: Europe/Moscow\n\nБлижайшее занятие:\n19.09.2026, 12:15\n\nИсключения:\n12.09.2026 · отменено\n26.09.2026 · перенесено на 27.09.2026, 20:00\n03.10.2026 · начало в 13:00\n\nСправка: /занятие ?")
  assert.equal(ru.scheduleShowText(saturday, {next: null, changes: []}), "РАСПИСАНИЕ\n\nКаждую субботу в 12:15\nЧасовой пояс: Europe/Moscow\n\nСправка: /занятие ?")
  assert.equal(ru.scheduleShowText(null), "Регулярное расписание пока не задано.\n\nЗадать: /занятие расписание <день недели> <чч:мм>\nПример: /занятие расписание вт 19:00")
  assert.equal(ru.scheduleShowText(saturday, outlook).includes("каждый(ая)"), false, "no localisation template leaks")
  const tuesday = ClassSchedule.parse("вт 19:00", "Europe/Moscow")
  assert.equal(ru.schedulePreviewText(tuesday, {date: "2026-09-15", time: "19:00"}), "НОВОЕ РАСПИСАНИЕ\n\nКаждый вторник в 19:00\nЧасовой пояс: Europe/Moscow\n\nБлижайшее занятие:\n15.09.2026, 19:00\n\nПрименить: /подтвердить\nПередумать: /отменить")
  assert.equal(ru.scheduleSetText(tuesday, {date: "2026-09-15", time: "19:00"}), "Расписание изменено: каждый вторник в 19:00.\nБлижайшее занятие: 15.09.2026, 19:00.\nПрошедшие занятия, переносы, отмены и материалы сохранены.")
  assert.equal(ru.scheduleBriefText(tuesday, {date: "2026-09-15", time: "19:00"}), "РАСПИСАНИЕ\n\nКаждый вторник в 19:00\nБлижайшее занятие: 15.09.2026, 19:00")
  assert.equal(ru.scheduleBriefText(tuesday, {date: "2026-09-15", time: "19:00"}, true), "РАСПИСАНИЕ\n\nКаждый вторник в 19:00\nБлижайшее занятие: 15.09.2026, 19:00\n\nИзменить: в личной беседе, /занятие расписание")
  assert.equal(ru.movePreviewText("2026-09-19", "12:15", "2026-09-19", "20:00", 2), "Перенести занятие 19.09.2026 с 12:15 на 20:00?\n\nПодтвердить: /подтвердить\nПередумать: /отменить")
  assert.equal(ru.movePreviewText("2026-09-19", "12:15", "2026-09-21", "20:00", 2), "Перенести занятие 19.09.2026, 12:15 на 21.09.2026, 20:00?\n\nЗадание и файлы переедут вместе с ним.\n\nПодтвердить: /подтвердить\nПередумать: /отменить")
  assert.equal(ru.cancelConfirmText("2026-09-19", "12:15", "2026-09-26", "12:15", 0), "Отменить занятие 19.09.2026, 12:15?\n\nК этому занятию пока ничего не опубликовано; следующее - 26.09.2026, 12:15.\n\nПодтвердить: /подтвердить\nПередумать: /отменить")
  assert.equal(ru.cancelConfirmText("2026-09-19", "12:15", "2026-09-26", "12:15", 3), "Отменить занятие 19.09.2026, 12:15?\n\nЗадание и файлы будут перенесены к занятию 26.09.2026, 12:15.\n\nПодтвердить: /подтвердить\nПередумать: /отменить")
  assert.equal(en.everyText(saturday), "Every Saturday at 12:15")
})

test("Russian classes list and polls: no zeros, plural forms, the poll list layout", () => {
  const session = (date, posts, files, extra = {}) => ({date, topic: null, time: null, status: "planned", posts: Array.from({length: posts}, () => ({})), files, ...extra})
  const upcoming = [
    {date: "2026-09-19", time: "12:15", status: "next", session: session("2026-09-19", 1, [])},
    {date: "2026-09-26", time: "12:15", status: "planned", session: null},
    {date: "2026-10-03", time: "12:15", status: "cancelled", session: {...session("2026-10-03", 0, []), status: "cancelled", movedTo: "2026-10-10"}},
  ]
  const recent = [
    {date: "2026-09-08", time: "18:00", status: "past", session: session("2026-09-08", 8, [{kind: "reading"}, {kind: "reading"}, {kind: "audio"}], {topic: "Гольбах"})},
    {date: "2026-09-06", time: "12:15", status: "past", session: session("2026-09-06", 0, [{kind: "audio"}])},
    {date: "2026-09-05", time: "12:15", status: "moved", session: {...session("2026-09-05", 0, []), status: "moved", movedTo: "2026-09-06"}},
  ]
  assert.equal(ru.classesOverviewText({upcoming, recent, year: 2026, month: 9}), "ЗАНЯТИЯ\n\nБлижайшие:\n19.09, 12:15 · 1 пост\n26.09, 12:15 · материалов нет\n03.10 · отменено\n\nПоследние:\n08.09 · Гольбах · 8 постов · 2 файла · запись\n06.09 · запись\n05.09 · перенесено на 06.09\n\nМесяц: /занятие список 09.2026\nАрхив: /занятие список архив\nСправка: /занятие ?")
  assert.equal(ru.classesMonthText({year: 2026, month: 9, items: [...recent].reverse().concat(upcoming.slice(0, 2))}), "ЗАНЯТИЯ · СЕНТЯБРЬ 2026\n\n05.09 · перенесено на 06.09\n06.09 · прошло · запись\n08.09 · прошло · Гольбах · 8 постов · 2 файла · запись\n19.09, 12:15 · ближайшее · 1 пост\n26.09, 12:15 · запланировано · материалов нет\n\nПредыдущий: /занятие список 08.2026\nСледующий: /занятие список 10.2026")
  assert.equal(ru.classesMonthText({year: 2026, month: 12, items: []}), "ЗАНЯТИЯ · ДЕКАБРЬ 2026\n\nЗанятий в этом месяце нет.\n\nПредыдущий: /занятие список 11.2026\nСледующий: /занятие список 01.2027")
  assert.equal(ru.classesYearText(2026, new Map([[1, 4], [2, 4], [3, 5], [9, 6]])), "ЗАНЯТИЯ · 2026\n\nЯнварь · 4 занятия\nФевраль · 4 занятия\nМарт · 5 занятий\nСентябрь · 6 занятий\n\nОткрыть месяц: /занятие список 09.2026")
  assert.equal(ru.classesArchiveText(new Map([[2026, 39], [2025, 46], [2024, 41]])), "АРХИВ ЗАНЯТИЙ\n\n2026 · 39 занятий\n2025 · 46 занятий\n2024 · 41 занятие\n\nОткрыть год: /занятие список 2025")
  const card = {date: "2026-09-19", time: "12:15", status: "next", topic: "Гольбах", posts: [{author: "sam", text: "Прочитать следующую главу.", editedAt: null}], files: [{name: "a.pdf", kind: "reading"}, {name: "b.pdf", kind: "reading"}], movedFrom: null, movedTo: null, schedule: saturday}
  assert.equal(ru.classCardText(card), "БЛИЖАЙШЕЕ ЗАНЯТИЕ\n\n19.09.2026, 12:15\nТема: Гольбах\n\nЗадание (sam):\nПрочитать следующую главу.\n\nФайлы:\n1. a.pdf\n2. b.pdf\n\nРасписание: каждую субботу в 12:15\n\nПолучить: /д <номер>\nВсе занятия: /занятие список\nСправка: /занятие ?")
  assert.equal(ru.classCardText({...card, files: [...card.files, {name: "лекция.mp3", kind: "audio"}]}).split("\n").filter((l) => /^\d\. /.test(l)).join("|"), "1. a.pdf|2. b.pdf|3. лекция.mp3", "one numbering across files and the recording")
  assert.equal(ru.classCardText({...card, status: "cancelled", movedTo: "2026-09-26", posts: [], files: [], topic: null}, {footer: false}), "ЗАНЯТИЕ · отменено\n\n19.09.2026, 12:15\nЗадание и файлы перенесены на 26.09.2026\n\nРасписание: каждую субботу в 12:15")
  assert.equal(ru.classCardText({...card, status: "planned", topic: null, posts: [], files: [], schedule: null}), "ЗАНЯТИЕ · запланировано\n\n19.09.2026, 12:15\n\nМатериалов пока нет.\n\nВсе занятия: /занятие список\nСправка: /занятие ?")
  assert.match(ru.classHelpText(), /^ЗАНЯТИЯ\n\n\/занятие \[дата\]\nБлижайшее или указанное занятие\.\nКоротко: \/з \[дата\]\n\n\/занятие список \[месяц\|год\|архив\][\s\S]*Коротко: \/з о\n/)
  const poll = (id, question, closesAt) => ({poll: {id, question, closesAt}, tally: {participants: 8}})
  assert.equal(ru.pollListText([poll(12, "Когда провести занятие?", "2026-09-16T15:00:00Z")], "Europe/Moscow"), "АКТИВНЫЕ ГОЛОСОВАНИЯ\n\n12  Когда провести занятие?\n    8 голосов · до 16.09.2026, 18:00\n\nОткрыть: /голосование 12\nСоздать: /голосование <вопрос> | <вариант 1> | <вариант 2>\nСправка: /голосование ?")
  assert.equal(ru.pollListText([poll(3, "А?", "2026-09-16T15:00:00Z"), {poll: {id: 12, question: "Б?", closesAt: "2026-09-16T22:30:00Z"}, tally: {participants: 1}}], "Europe/Moscow"), "АКТИВНЫЕ ГОЛОСОВАНИЯ\n\n3   А?\n    8 голосов · до 16.09.2026, 18:00\n\n12  Б?\n    1 голос · до 17.09.2026, 01:30\n\nОткрыть: /голосование <номер>\nСоздать: /голосование <вопрос> | <вариант 1> | <вариант 2>\nСправка: /голосование ?")
  assert.match(ru.pollNoActiveText(), /\nСправка: \/голосование \?$/)
  assert.doesNotMatch(ru.pollNoActiveText(), /Все параметры/)
})

test("the help is written as ? everywhere: no text advertises /help, /help all or a section's помощь", () => {
  const samples = (t) => [
    t.helpText(true, true, false),
    t.helpText(true, true, true),
    t.helpText(false, false, false),
    t.greetingText(null),
    t.spinozaHelpText(null),
    t.groupGreetingText(null),
    t.classHelpText(),
    t.filesHelpText(),
    t.pollHelpText(),
    t.ethicsHelpText(),
    t.ethicsGuideText(),
    t.unknownCommandText("/gett", "/дай <номер|имя>"),
    t.promotionText("granted", "alice"),
    t.botCommandsSpec,
  ]
  for (const t of [ru, en]) {
    for (const text of samples(t)) {
      assert.doesNotMatch(text, /\/help\b|\/\?\?\?/u, `still offers /help: ${text.slice(0, 60)}`)
      assert.doesNotMatch(text, /\/(файлы|занятие|голосование|этика|files|class|vote|ethics) (помощь|справка|help)\b/u, `still offers a section's help by word: ${text.slice(0, 60)}`)
    }
    assert.match(t.helpText(false, true, false), /\/\?\?$/u, "the short help ends with the way to see every command")
    assert.match(t.helpText(false, true, true), /\/\?\? - /u, "the full help explains ? and ??")
  }
})

test("one block of sections: the greeting is the short help, /spinoza repeats the same lines; footers name /занятие список; ties are marked", () => {
  for (const t of [ru, en]) {
    const short = t.helpText(false, true, false)
    assert.equal(t.greetingText(null), short, "a member's greeting is the short help")
    assert.equal(t.greetingText({latin: "Deus sive Natura.", ref: "Э4пред"}), `Deus sive Natura.\n[Э4пред]\n\n${short}`)
    for (const line of t.sectionLines()) {
      assert.ok(short.includes(line), `short help lacks ${line}`)
      assert.ok(t.spinozaHelpText(null).includes(line), `/spinoza help lacks ${line}`)
    }
    assert.ok(t.spinozaHelpText(null).includes(t.lettersText()))
    for (const text of [t.helpText(true, true, true), t.classHelpText(), t.filesHelpText(), t.pollHelpText(), t.ethicsGuideText(), t.ethicsNotFoundText("Э1т7кор", [{rid: "Э1т7", meaning: "x"}])]) {
      assert.doesNotMatch(text, /•/, "no bullets anywhere")
    }
  }
  const card = {date: "2026-09-19", time: "12:15", status: "next", topic: null, posts: [], files: [], movedFrom: null, movedTo: null, schedule: null}
  assert.match(ru.classCardText(card), /\nВсе занятия: \/занятие список\nСправка: \/занятие \?$/)
  assert.doesNotMatch(ru.classesOverviewText({upcoming: [], recent: [], year: 2026, month: 9}) + ru.sessionNotFoundText("x") + ru.classesUsageText("завтра") + ru.classesArchiveText(new Map([[2026, 1]])), /\/занятия\b/, "the list is always /занятие список")
  assert.match(ru.classesUsageText("завтра"), /\nОдно занятие: \/занятие завтра$/)
  const poll = {id: 1, options: ["a", "b", "c"], multiple: false}
  assert.equal(ru.pollOptionsText(poll, [1, 0, 1], [0, 2]), "👍 a · 1 · поровну\n😀 b · 0\n😂 c · 1 · поровну")
  assert.equal(ru.pollOptionsText(poll, [2, 0, 1], [0]), "👍 a · 2 · выбрано\n😀 b · 0\n😂 c · 1")
  assert.equal(ru.announcedText("Занятие 19.09.2026 теперь в 20:00.", ["Ethics"]), "Занятие 19.09.2026 теперь в 20:00. Объявлено в группе «Ethics».")
  assert.equal(ru.reminderText(30, "Гольбах, глава 4"), "Занятие начнётся через 30 минут: Гольбах, глава 4.")
  assert.equal(ru.slowDownText(10), "Слишком много сообщений - подождите 10 минут, пожалуйста.")
  assert.equal(ru.slowDownText(), "Слишком много сообщений - подождите минуту, пожалуйста.")
  assert.equal(ru.ethicsSearchText("любовь", [], 25, {part: 3}), "По запросу «любовь» · часть 3 ничего не найдено.\n\nСправка: /этика ?")
})

// ---------------------------------------------------------------------------
// Every language must be a complete translation of en.js: the same keys, and no
// text left in English. Adding a language is a copy of en.js with the values
// translated, so these checks are what makes that safe (see src/bot/replies.js).
// ---------------------------------------------------------------------------
const CODES = Object.keys(LANGUAGES)
const saturdayUtc = ClassSchedule.parse("сб 12:15", "UTC")
const usageSample = {used: 148 * 1024 ** 2, limit: 10 * 1024 ** 3, free: 10 * 1024 ** 3 - 148 * 1024 ** 2, reserved: 0, diskFree: 175 * 1024 ** 3}
const citation = {latin: "Deus sive Natura.", ref: "Э4предисл"}
const sessionSample = {date: "2026-09-19", topic: "Substance", time: "12:15", status: "planned", posts: [{itemId: 1, author: "sam", text: "Read part one.", sentAt: "2026-09-16T09:00:00Z", editedAt: null}], files: [{name: "reading.pdf", kind: "reading", addedAt: "2026-09-16T09:00:00Z", author: "sam"}]}
const pollSample = {id: 1, question: "When shall we meet?", options: ["Monday", "Tuesday"], multiple: false, status: "open", group: {name: "Ethics"}, closesAt: "2026-09-20T09:00:00Z", closedAt: null}
const tallySample = {counts: [2, 1], participants: 3, leaders: [0]}

/** One call of each text that has real layout in it - a crash or a stray template shows up here. */
const renderAll = (t) => [
  t.helpText(false, true, false),
  t.helpText(true, true, true),
  t.helpText(false, false, false),
  t.greetingText(citation, true),
  t.greetingText(citation, false),
  t.spinozaHelpText(citation),
  t.groupGreetingText(citation),
  t.introText(),
  t.sectionLines().join("\n"),
  t.lettersText(),
  t.listText([{name: "reading.pdf", size: 4096, modifiedAt: new Date("2026-09-16T09:00:00Z")}], "", 3500),
  t.listText([], "*.pdf", 3500),
  t.deletedListText([{name: "old.pdf", size: 1024, modifiedAt: new Date("2026-09-16T09:00:00Z")}], 3500),
  t.notFoundText("nope.bin"),
  t.fileComingText("reading.pdf"),
  t.fileNotKeptText("reading.pdf"),
  t.whichFileText(),
  t.attachRefusedText("lecture.mp3", "full"),
  t.attachRefusedText("../x.mp3", "unsafe"),
  t.groupFileLines().join("\n"),
  t.getUsageText(),
  t.deletedText("a.pdf", "a.pdf", {number: 1}),
  t.restoredText("a.pdf", "a.pdf", {}),
  t.spaceText(usageSample, {count: 1, bytes: 1024, retentionMs: 30 * 86_400_000}),
  t.statusText({name: "spinoza", version: "1.1.0", uptimeMs: 3_600_000, groups: [{title: "Ethics"}], fileCount: 2, usage: usageSample, deleted: {count: 0, bytes: 0}, schedule: saturdayUtc, classCount: 1, unknownCommands: []}),
  t.slowDownText(3),
  t.unknownCommandText("/gett", "/get"),
  t.privateOnlyText(),
  t.ethicsHelpText(),
  t.ethicsGuideText(),
  t.everyText(saturdayUtc),
  t.whenText("2026-09-19", "12:15"),
  t.confirmLinesText().join("\n"),
  t.nothingToConfirmText(),
  t.announcedText("Class moved.", ["Ethics"]),
  t.reminderText(30, "Substance"),
  t.scheduleShowText(saturdayUtc, {next: {date: "2026-09-19", time: "12:15", movedFrom: null}, changes: []}),
  t.scheduleShowText(null),
  t.classCardText({date: "2026-09-19", time: "12:15", status: "next", topic: sessionSample.topic, posts: sessionSample.posts, files: sessionSample.files, movedFrom: null, movedTo: null, schedule: saturdayUtc}),
  t.classCardText({date: "2026-09-26", time: "12:15", status: "planned", topic: null, posts: [], files: [], movedFrom: null, movedTo: null, schedule: saturdayUtc}),
  t.classesMonthText({year: 2026, month: 9, items: [{date: "2026-09-19", time: "12:15", status: "next", session: sessionSample}]}),
  t.classesYearText(2026, new Map([[9, 3]])),
  t.classesArchiveText(new Map([[2026, 12]])),
  t.classesOverviewText({upcoming: [{date: "2026-09-19", time: "12:15", status: "next", session: sessionSample}], recent: [], year: 2026, month: null}),
  t.pollPostText(pollSample, tallySample, "UTC"),
  t.pollListText([{poll: pollSample, tally: tallySample}], "UTC"),
  t.pollPublishedText(pollSample),
]

for (const code of CODES) {
  test(`${code}: the same keys as en.js, nothing missing and nothing extra`, () => {
    const language = LANGUAGES[code]
    assert.deepEqual(Object.keys(language).sort(), Object.keys(LANGUAGES.en).sort(), `${code}.js must have exactly the keys of en.js`)
    for (const key of Object.keys(LANGUAGES.en)) assert.equal(typeof language[key], typeof LANGUAGES.en[key], `${code}.${key} has another type than in en.js`)
    assert.equal(language.language, code, `${code}.js must report its own code`)
  })

  test(`${code}: every text renders - no crash, no empty answer, no template left behind`, () => {
    const texts = renderAll(createReplies(code, {triggerWord: "conatus"}))
    for (const text of texts) {
      assert.equal(typeof text, "string")
      assert.ok(text.trim().length > 0, `${code}: an empty text`)
      assert.doesNotMatch(text, /\$\{|\{\w+\}|undefined|NaN/, `${code}: unfinished text «${text.slice(0, 120)}»`)
    }
  })
}

test("the configured language is one of these and English is the default", () => {
  assert.equal(DEFAULT_LANGUAGE, "en")
  assert.deepEqual(LANGUAGE_CODES, CODES)
  assert.throws(() => createReplies("de"), /unsupported language "de"/)
})

test("a new language file is really translated, not a copy of en.js", () => {
  const english = createReplies("en", {triggerWord: "conatus"})
  for (const code of CODES.filter((c) => c !== "en")) {
    const t = createReplies(code, {triggerWord: "conatus"})
    // texts a translator cannot leave as they are; command names inside them stay English on purpose
    for (const [what, a, b] of [
      ["introText", t.introText(), english.introText()],
      ["short help", t.helpText(false, true, false), english.helpText(false, true, false)],
      ["full help", t.helpText(false, true, true), english.helpText(false, true, true)],
      ["sectionLines", t.sectionLines().join("\n"), english.sectionLines().join("\n")],
      ["lettersText", t.lettersText(), english.lettersText()],
      ["ethicsHelpText", t.ethicsHelpText(), english.ethicsHelpText()],
      ["spaceText", t.spaceText(usageSample, {count: 0, bytes: 0, retentionMs: 0}), english.spaceText(usageSample, {count: 0, bytes: 0, retentionMs: 0})],
      ["notFoundText", t.notFoundText("a.pdf"), english.notFoundText("a.pdf")],
      ["privateOnlyText", t.privateOnlyText(), english.privateOnlyText()],
    ]) {
      assert.notEqual(a, b, `${code}: ${what} is still the English text - translate it`)
    }
  }
})
