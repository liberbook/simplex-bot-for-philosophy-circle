import {formatSize} from "../util/format.js"
import {formatDate} from "../domain/Session.js"
import {POLL_REACTIONS} from "../domain/Poll.js"
import {fitLines, shortFileName} from "./layout.js"

/**
 * Ukrainian texts. Same keys as en.js - a test compares the key sets, so a new
 * language is a copy of en.js with the values translated and nothing else.
 *
 * Commands stay as they are typed (/files, /class, /vote, /ethics and the Russian
 * forms): the bot parses the same words whatever language it answers in.
 */
/** «1 файл», «2 файли», «5 файлів» */
const plural = (n, [one, few, many]) => {
  const m10 = n % 10
  const m100 = n % 100
  const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
  return `${n} ${word}`
}
const FILES = ["файл", "файли", "файлів"]
const POSTS = ["допис", "дописи", "дописів"]
const DAYS = ["день", "дні", "днів"]
const VOTES = ["голос", "голоси", "голосів"]
const MINUTES = ["хвилину", "хвилини", "хвилин"]
const POLLS = ["активне опитування", "активних опитування", "активних опитувань"]
const ENTRIES = ["положення", "положення", "положень"]
const CLASSES = ["заняття", "заняття", "занять"]
/** nominative: the month names read as headings and list rows ("ВЕРЕСЕНЬ 2026", "Вересень · 6 занять") */
const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"]
/** genitive: "Кожної суботи о 12:15" - the Ukrainian way of saying "every Saturday" */
const EVERY = ["Кожної неділі", "Кожного понеділка", "Кожного вівторка", "Кожної середи", "Кожного четверга", "Кожної п'ятниці", "Кожної суботи"]
const ROMAN = ["I", "II", "III", "IV", "V"]
/** plural labels of the Ethics entry types (the corpus is Russian) for the structure summary */
const ETHICS_TYPES = {
  определение: "Визначення",
  аксиома: "Аксіоми",
  "аксиома (о телах)": "Аксіоми про тіла",
  постулат: "Постулати",
  лемма: "Леми",
  теорема: "Теореми",
  доказательство: "Доведення",
  королларий: "Короларії",
  схолия: "Схолії",
  объяснение: "Пояснення",
  "определение аффекта": "Визначення афектів",
  "общее определение аффектов": "Загальне визначення афектів",
  предисловие: "Передмова",
  прибавление: "Додаток",
  "прибавление (глава)": "Розділи додатка",
  примечание: "Примітки",
}

export const uk = {
  language: "uk",
  /** «9,9 GiB» - розмір з українською десятковою комою */
  sizeText: (bytes) => formatSize(bytes).replace(".", ","),
  // the apps' command menu - the closest thing to buttons: the frequent next actions
  botCommandsSpec: `'Довідка':/?,'Файли':/files,'Отримати файл':/'get <номер|назва>','Найближче заняття':/class,'Заняття':/'class list','Розклад':/'class schedule','Опитування':/vote,'Спіноза, Етика':/'ethics <ID>','Пошук в Етиці':/'ethics search <текст>','Сповіщення':/watch,'Усі команди':/??`,

  /** The greeting when the bot joins a group: a quotation and what is done in the group. @param {{latin, ref}|null} citation */
  groupGreetingText(citation) {
    return [
      ...(citation ? [citation.latin, `[${citation.ref}]`, ""] : []),
      ...this.groupFileLines(),
      "prius [дата] - пов'язати файл з минулим заняттям",
      "",
      "/spinoza - відкрити особисту бесіду або отримати довідку",
      "/spinoza schedule - показати розклад",
      "/spinoza class [дата] [тема] - пов'язати допис із заняттям",
    ].join("\n")
  },
  spinozaLinkText: (link) => `Одноразове посилання на особисту бесіду:\n${link}`,
  /** What the group does with files - the same lines in the group greeting, the private greeting and every help. */
  groupFileLines() {
    return ["кожен файл групи зберігається в архіві", `${this.triggerWord} - у відповідь на файл або одразу після нього: викладу файл у групу й надішлю вам особисто`]
  },
  /** The first message of a private chat the bot opens to send a requested file. */
  fileComingText: (name) => `Ви просили ${shortFileName(name)} - надішлю сюди, щойно ви приймете цю бесіду.`,
  /** A requested file left the archive (deleted, or never downloaded) - said privately. */
  fileNotKeptText: (name) => `${shortFileName(name)} більше не зберігається. Збережені файли: /files`,
  /** The caption of a file the bot re-posts in the group for the trigger word: the requester also gets it privately. */
  fileInGroupText: (name) => `${name}, файл також у вашій особистій бесіді з ботом.`,
  /** The fetch word with no file near it - said privately. */
  whichFileText() {
    return `Який файл? Напишіть ${this.triggerWord} у відповідь на файл або одразу після того, як його надіслали.`
  },
  /** A quotation before a text: every help starts with a thought of Spinoza's. */
  withQuotationText: (citation, text) => (citation ? `${citation.latin}\n[${citation.ref}]\n\n${text}` : text),
  spinozaHelpSentText: () => "Довідку надіслано вам особисто.",
  spinozaChatOpenedText: () => "Надіслав вам запит на особисту бесіду - прийміть його у списку чатів, довідка прийде туди.",
  spinozaPendingText: () => "Запит на особисту бесіду вже надіслано - прийміть його у списку чатів.",
  introText: () => "Я зберігаю файли групи, організую заняття і допомагаю читати «Етику» Спінози.",
  /** The sections of the private chat - ONE block for the greeting, /? and /spinoza (rule: the three texts never drift apart). */
  sectionLines: () => [
    "/files - збережені файли",
    "/class - найближче заняття, розклад, перенесення",
    "/vote - опитування",
    "/ethics - «Етика» Спінози",
    "/watch - сповіщення про заняття",
  ],
  lettersText: () => "Команди можна скорочувати до однієї літери: /f, /c, /v, /e, /w.",
  /** The personal help for /spinoza (from the group or privately): what is done privately and what in the group. */
  spinozaHelpText(citation) {
    return [
      ...(citation ? [citation.latin, `[${citation.ref}]`, ""] : []),
      this.introText(),
      "",
      "В особистій бесіді:",
      ...this.sectionLines(),
      "/? - основні команди, /?? - усі команди",
      this.lettersText(),
      "",
      "У групі:",
      ...this.groupFileLines(),
      "prius [дата] - пов'язати файл з минулим заняттям або із заняттям указаної дати",
      "/spinoza schedule - показати розклад",
      "/spinoza class [дата] [тема] - пов'язати допис із заняттям",
      "/spinoza - ця довідка в особисту бесіду",
    ].join("\n")
  },

  /**
   * @param {boolean} isAdmin
   * @param {boolean} isMember member of the served group (non-members only get Ethics and help)
   * @param {boolean} full every command by section (/??); otherwise the short help
   */
  helpText(isAdmin = false, isMember = true, full = false) {
    if (!isMember) {
      return [
        "Файли і заняття доступні учасникам групи, яку я обслуговую. Що доступно вам тут:",
        "/ethics <ID> - положення з «Етики». Приклад: /ethics E1p7",
        "/ethics search <текст> - знайти текст в «Етиці»",
        "/? - ця довідка",
      ].join("\n")
    }
    if (!full) return [this.introText(), "", ...this.sectionLines(), "", this.lettersText(), "Усі команди: /??"].join("\n")
    // every operation of every section, one line each (the section help adds the details)
    const lines = [
      "ФАЙЛИ",
      "/files [шаблон] - показати файли",
      "/get <номер|назва> - отримати файл",
      "/delete <номер|назва> - перемістити до кошика",
      "/deleted - показати видалені файли",
      "/restore <номер|назва> - повернути файл",
      "/space - використання сховища",
      "/files ? - докладніше",
      "",
      "ЗАНЯТТЯ",
      "/class [дата] - одне заняття і його матеріали",
      "/class list [місяць|рік|архів] - списки та архів занять",
      "/class schedule [день] [час] - показати або змінити розклад",
      "/class move <дата> [час] - перенести одне заняття",
      "/class cancel [дата] - скасувати одне заняття",
      "/watch [on|off] - сповіщення про зміни",
      "/class ? - докладніше",
      "",
      "ОПИТУВАННЯ",
      "/vote - активні опитування",
      "/vote <питання> | <варіант 1> | <варіант 2> - створити",
      "/vote <номер> - стан і результати",
      "/vote close <номер> - завершити",
      "/vote cancel <номер> - скасувати",
      "/vote history - завершені",
      "/vote ? - докладніше",
      "",
      "ЕТИКА",
      "/ethics - пам'ятка",
      "/ethics [full|all] <ID> - положення: E1p7, часть 1 теорема 7",
      "/ethics search <текст> - знайти",
      "/ethics list <частина> - структура частини",
      "/ethics random - випадкова теорема",
      "/ethics ? - позначення і режими",
      "",
      "У ГРУПІ",
      ...this.groupFileLines(),
      "prius [дата] - пов'язати файл з минулим заняттям або із заняттям указаної дати (так само, як conatus)",
      "/spinoza class [дата] [тема] - пов'язати допис із заняттям: першим рядком допису, відповіддю або коментарем",
      "/spinoza schedule - показати розклад; /spinoza - довідка в особисту бесіду",
      "",
      "ІНШЕ",
      "/status - стан бота",
      "/confirm, /drop - прийняти або відкинути показану зміну",
      "",
      "СКОРОЧЕННЯ",
      "Одна літера для розділу, англійське слово для операції:",
      "/f = /files",
      "/f delete 2 = /files delete 2",
      "/c 19.09 = /class 19.09",
      "/c move 20:00 = /class move 20:00",
      "/v close 1 = /vote close 1",
      "/e full E1p7 = /ethics full E1p7",
      "/w on = /watch on",
      "Російські форми /ф /з /г /э /у і /д /п /о теж працюють",
      "",
      "ДОВІДКА",
      "/? - основні команди",
      "/?? - усі команди (ця довідка)",
      "/<розділ> ? - довідка розділу: /f ?, /c ?, /v ?, /e ?",
    ]
    // /invite and /join are intentionally NOT listed here (admins learn them from the README) - do not add them back.
    if (isAdmin) lines.push("", "АДМІНІСТРАТОР", "/admins - адміністратори", "/unadmin <ім'я> - зняти адміністратора")
    return lines.join("\n")
  },
  /** The greeting of a new private contact. @param {{latin, ref}|null} citation */
  greetingText(citation, isMember = true) {
    return this.withQuotationText(citation, this.helpText(false, isMember, false)) // the greeting IS the short help
  },
  /** A list line: the name (long ones shortened), size, date; an empty file is flagged instead of dated. */
  fileLineText(number, f) {
    const name = shortFileName(f.name)
    if (f.size === 0) return `${number}. ${name} · 0 B · файл порожній або завантажений не повністю`
    return `${number}. ${name} · ${this.sizeText(f.size)} · ${this.dateText(f.modifiedAt.toISOString().slice(0, 10))}`
  },
  listText(files, pattern, maxChars) {
    if (files.length === 0) return pattern ? `За шаблоном «${pattern}» файлів немає.\n\nСписок: /files` : "Файлів поки немає."
    const head = `ФАЙЛИ · ${files.length}${pattern ? ` · шаблон ${pattern}` : ""} · новіші згори`
    const {lines, shown} = fitLines(files, maxChars - 100, (f, n) => this.fileLineText(n, f), head.length)
    const more = shown < files.length ? [`… і ще ${files.length - shown} - уточніть: /files <шаблон>`] : []
    return [head, "", ...lines, ...more, "", "Отримати: /get <номер>", "Фільтр: /files <шаблон>", "Довідка: /files ?"].join("\n")
  },
  notFoundText: (query) => `Файла «${query}» немає.\n\nСписок: /files`,
  unknownCommandText: (word, suggestion) => [`Не вдалося розпізнати команду «${word}».`, "", ...(suggestion ? ["Можливо, ви мали на увазі:", suggestion, ""] : []), "Довідка: /?", "Усі команди: /??"].join("\n"),
  /** Too many files for one answer: a numbered choice. @param {string[]} names */
  tooManyText(query, names, maxChars) {
    const head = `ЗНАЙДЕНО · ${names.length} · ${query}`
    const {lines, shown} = fitLines(names, maxChars - 80, (name, n) => `${n}. ${shortFileName(name)}`, head.length)
    const more = shown < names.length ? [`… і ще ${names.length - shown}`] : []
    return [head, "", ...lines, ...more, "", "Отримати: /get <номер>", "Уточнити: /get <назва>"].join("\n")
  },
  getUsageText: () => "Укажіть номер або назву файла.\n\nПриклад: /get 3\nСписок: /files",
  noSuchNumberText: (number, count) => (count === 0 ? "Список ще не показано.\n\nСписок: /files" : `Номера ${number} у списку немає - у ньому ${count}.\n\nСписок: /files`),
  sendFailedText: (name) => `Вибачте, не вдалося надіслати ${name}.`,
  deniedText: () => "Вибачте, це доступно лише учасникам групи, яку я обслуговую.\n\nЩо доступно вам: /?",

  promotionText(outcome, name) {
    switch (outcome) {
      case "granted":
        return `Вітаю, ${name} - тепер ви адміністратор. Надішліть /??, щоб побачити команди адміністратора.`
      case "already":
        return "Ви вже адміністратор."
      case "disabled":
        return "Доступ адміністратора на цьому боті не налаштовано."
      default:
        return "Хибний секрет."
    }
  },
  adminsOnlyText: () => "Вибачте, ця команда лише для адміністраторів.",
  adminsListText: (admins) => (admins.length === 0 ? "Адміністраторів поки немає." : ["АДМІНІСТРАТОРИ", "", ...admins.map((a) => `${a.name} · з ${formatDate(a.since.slice(0, 10))}`), "", "Зняти: /unadmin <ім'я>"].join("\n")),
  deleteUsageText: () => "Укажіть номер або точну назву файла, по одному за раз.\n\nПриклад: /delete 3\nСписок: /files",
  /** @param {{classDate?: string|null, number?: number}} [o] classDate - the class card the file left; number - its number in the deleted folder now */
  deletedText(name, storedAs, {classDate = null, number = 1} = {}) {
    const head = `Файл «${shortFileName(name)}» переміщено до кошика${storedAs !== name ? ` під назвою «${shortFileName(storedAs)}»` : ""}.`
    return [head, ...(classDate ? [`Прибрано із заняття ${this.dateText(classDate)}.`] : []), "", `Повернути: /restore ${number}`, "Кошик: /deleted"].join("\n")
  },
  /** @param {"delete"|"restore"} action */
  ambiguousNameText(query, candidates, total, action = "delete") {
    const command = action === "delete" ? "/delete" : "/restore"
    const head = `ЗНАЙДЕНО · ${total} · ${query}`
    const rows = candidates.map((c, i) => `${i + 1}. ${shortFileName(c)}`)
    const more = total > candidates.length ? [`… і ще ${total - candidates.length}`] : []
    const verb = action === "delete" ? "Видалити" : "Повернути"
    return [head, "", ...rows, ...more, "", total === 1 ? `${verb}: ${command} 1` : `${verb} по одному: ${command} <номер>`].join("\n")
  },
  restoreUsageText: () => "Укажіть номер або точну назву файла.\n\nПриклад: /restore 3\nСписок: /deleted",
  restoredText(name, storedAs, {classDate = null} = {}) {
    const head = `Файл «${shortFileName(name)}» повернуто до архіву${storedAs !== name ? ` під назвою «${shortFileName(storedAs)}»` : ""}.`
    return [head, ...(classDate ? [`Повернувся до заняття ${this.dateText(classDate)}.`] : []), "", "Список: /files"].join("\n")
  },
  deletedNotFoundText: (query) => `У кошику файла «${query}» немає.\n\nКошик: /deleted`,
  deletedListText(files, maxChars) {
    if (files.length === 0) return "Кошик порожній."
    const head = `КОШИК · ${files.length} · новіші згори`
    const {lines, shown} = fitLines(files, maxChars - 100, (f, n) => this.fileLineText(n, f), head.length)
    const more = shown < files.length ? [`… і ще ${files.length - shown}`] : []
    return [head, "", ...lines, ...more, "", "Повернути: /restore <номер>", "Довідка: /files ?"].join("\n")
  },
  /** @param {{used, reserved, limit, free, diskFree}} usage @param {{count, bytes, retentionMs}} deleted */
  spaceText(usage, deleted) {
    const lines = ["СХОВИЩЕ", "", `Архів: ${this.sizeText(usage.used)} з ${this.sizeText(usage.limit)}`, `Вільно в архіві: ${this.sizeText(usage.free)}`]
    if (usage.reserved > 0) lines.push(`Завантажується зараз: ${this.sizeText(usage.reserved)}`)
    lines.push("", deleted.count > 0 ? `Кошик: ${this.sizeText(deleted.bytes)} · ${plural(deleted.count, FILES)}` : "Кошик порожній")
    if (deleted.retentionMs > 0) lines.push(`Термін зберігання: ${plural(Math.round(deleted.retentionMs / 86_400_000), DAYS)}`)
    if (usage.diskFree !== null) lines.push("", `Вільно на диску: ${this.sizeText(usage.diskFree)}`)
    lines.push("", "Кошик: /deleted", "Довідка: /files ?")
    return lines.join("\n")
  },
  statusText(s) {
    const hours = Math.floor(s.uptimeMs / 3_600_000)
    const minutes = Math.floor((s.uptimeMs % 3_600_000) / 60_000)
    return [
      "СТАН",
      "",
      `${s.name} ${s.version} · працює ${hours} год ${minutes} хв`,
      `Групи: ${s.groups.length > 0 ? s.groups.map((g) => g.title).join(", ") : "поки немає"}`,
      s.fileCount > 0 ? `Архів: ${plural(s.fileCount, FILES)} · ${this.sizeText(s.usage.used)} з ${this.sizeText(s.usage.limit)}${s.usage.reserved > 0 ? ` · завантажується ${this.sizeText(s.usage.reserved)}` : ""}` : `Архів порожній · ліміт ${this.sizeText(s.usage.limit)}`,
      s.deleted.count > 0 ? `Кошик: ${plural(s.deleted.count, FILES)} · ${this.sizeText(s.deleted.bytes)}` : "Кошик порожній",
      s.classCount > 0 ? `Занять: ${s.classCount}` : "Занять поки немає",
      s.schedule ? `Розклад: ${this.everyText(s.schedule, false)}` : "Розклад не задано",
      ...(s.unknownCommands?.length > 0 ? [`Невідомі команди: ${s.unknownCommands.map((u) => `${u.word} ×${u.count}`).join(", ")}`] : []),
      "",
      "Сховище: /space",
    ].join("\n")
  },
  /** @param {number} minutes the window of the limit */
  slowDownText: (minutes = 1) => `Забагато повідомлень - зачекайте ${minutes === 1 ? "хвилину" : plural(minutes, MINUTES)}, будь ласка.`,
  adminLockedText: () => "Забагато хибних секретів - протягом години я не відповідатиму на /admin від вас.",
  unadminUsageText: () => "Кого зняти?\n\nПриклад: /unadmin sam\nСписок: /admins",
  unadminDoneText: (name) => `${name} більше не адміністратор.\nВласники і адміністратори групи зберігають права за своєю роллю в групі.`,
  unadminNotFoundText: (name) => `Адміністратора «${name}» немає.\n\nСписок: /admins`,
  inviteText: (link) => `Одноразове запрошення до особистої бесіди зі мною (для однієї людини):\n${link}`,
  joinUsageText: () => "Яка група?\n\nПриклад: /join <посилання на групу> (посилання з налаштувань групи)",
  joiningText(result, groupPattern, matches) {
    const name = result.title ? `групи «${result.title}»` : "групи"
    switch (result.status) {
      case "joined":
        return `Я вже учасник ${name}.`
      case "own":
        return "Це моє власне посилання."
      case "notGroupLink":
        return "Це не посилання на групу (схоже на адресу контакту або одноразове запрошення)."
      default: {
        const head = `Приєднуюся до ${name}… Я вступлю автоматично, щойно група мене прийме; перебіг видно в моєму журналі.`
        return matches ? head : `${head}\nУвага: група не відповідає налаштованому шаблону «${groupPattern}», тому її файли я не зберігатиму і не роздаватиму.`
      }
    }
  },
  joinFailedText: (reason) => `Не вдалося під'єднатися за цим посиланням: ${reason}`,

  /** «/ethics» without parameters - the practical memo. */
  ethicsHelpText: () => `СПІНОЗА, «ЕТИКА»

Читати:
/ethics E1p7 - положення і доведення
/ethics full E1p7 - додати схолії та короларії
/ethics all E1p7 - також розкрити пов'язані положення

Шукати:
/ethics search любовь

Дивитися структуру:
/ethics list 3
/ethics random

Коротко:
/e E1p7
/e full E1p7
/e all E1p7
/e search любовь
/e list 3
/e random

Довідка: /ethics ?`,
  /** «/ethics ?» - the reference of identifiers, modes and search. */
  ethicsGuideText: () => `ІДЕНТИФІКАТОРИ «ЕТИКИ»

Э1т7       частина I, теорема 7
Э1т7док    доведення
Э1т6кор1   перший короларій
Э1т8сх2    друга схолія
Э1опр3     визначення 3
Э1акс1     аксіома 1
Э2пост4    постулат 4
Э2лем3     лема 3
Э3афф1     визначення афекту 1

Можна без «Э»:
1т7

Можна латиницею:
E1p7 або 1p7

РЕЖИМИ

/ethics <ID>
Положення і доведення.

/ethics full <ID>
Додати короларії, схолії, пояснення
та примітки, що належать до положення.

/ethics all <ID>
Повний текст, а потім тексти всіх згаданих положень.

ПОШУК

/ethics search <текст>
/ethics search <текст> part <1-5>
/ethics search <текст> type <тип>

Приклади:
/ethics search любовь part 3
/ethics search свобода type схолия

КОРОТКІ ФОРМИ

/e <ID>
/e full <ID> - full
/e all <ID> - all
/э п <текст> - пошук (ч <частина>, т <тип>)
/э с <частина> - список
/e random - випадково`,
  /** @param {{rid: string, meaning: string}[]} hints what the identifier may have meant */
  ethicsNotFoundText(ref, hints = []) {
    if (hints.length === 0) return `Положення «${ref}» немає.\n\nДовідка: /ethics ?`
    return [`Положення «${ref}» немає.`, "", "Можливі форми:", ...hints.map((h) => `${h.rid} - ${h.meaning}`), "", `Показати все положення: /ethics full ${hints[0].rid}`].join("\n")
  },
  ethicsUnknownModeText: (word, ref) => `Не вдалося розпізнати режим «${word}».\n\nМожливо, ви мали на увазі:\n/ethics full ${ref}\n/ethics all ${ref}`,
  /** @param {{part?: number|null, type?: string|null}} [filter] what the search was limited to */
  ethicsSearchText(query, results, max, {part = null, type = null} = {}) {
    const scope = `${part ? ` · частина ${part}` : ""}${type ? ` · ${type}` : ""}`
    if (results.length === 0) return `За запитом «${query}»${scope} нічого не знайдено.\n\nДовідка: /ethics ?`
    const shown = results.slice(0, max).map((e) => `${e.rid} (${e.type}): ${e.text.slice(0, 100)}…`)
    const more = results.length > max ? [`… і ще ${results.length - max}`] : []
    const narrow = part === null ? [`Уточнити: /ethics search ${query} part <1-5>`] : []
    return [`ПОШУК В «ЕТИЦІ» · ${query}${scope} · ${results.length}`, "", ...shown, ...more, "", "Відкрити: /ethics <ID>", ...narrow].join("\n")
  },
  /** «Теореми» - the plural label of an entry type in the structure summary */
  ethicsTypeLabel: (type) => ETHICS_TYPES[type] ?? type,
  /**
   * «/ethics list 3» - the structure of a part: how many entries of each type, not the entries themselves.
   * @param {Array<[string, number]>} counts type -> count in reading order
   */
  ethicsListText(part, counts) {
    if (part === null) return "Яка частина?\n\nПриклад: /ethics list 3"
    const total = counts.reduce((sum, [, n]) => sum + n, 0)
    return [`ЕТИКА · ЧАСТИНА ${ROMAN[part - 1] ?? part} · ${plural(total, ENTRIES)}`, "", ...counts.map(([type, n]) => `${this.ethicsTypeLabel(type)} · ${n}`), "", `Перелік: /ethics list ${part} теоремы`, "Відкрити: /ethics <ID>"].join("\n")
  },
  /** «/ethics list 3 теоремы» - the entries of one type with the start of their text. */
  ethicsTypeListText(part, type, entries) {
    if (entries.length === 0) return `У частині ${ROMAN[part - 1] ?? part} немає положень типу «${type}».\n\nСтруктура: /ethics list ${part}`
    return [`ЕТИКА · ЧАСТИНА ${ROMAN[part - 1] ?? part} · ${this.ethicsTypeLabel(entries[0].type).toUpperCase()} · ${entries.length}`, "", ...entries.map((e) => `${e.rid} - ${e.text.length > 70 ? `${e.text.slice(0, 70)}…` : e.text}`), "", "Відкрити: /ethics <ID>"].join("\n")
  },
  ethicsContinuedText: (i, n) => `(частина ${i} з ${n})`,
  ethicsTruncatedText: (n) => `… решту пропущено (більше ніж ${n} повідомлень). Запитайте менші фрагменти, наприклад /ethics full <ID>.`,

  // ---- classes ("заняття") ----
  weekdayName: (i) => ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"][i],
  dateText: (ymd) => formatDate(ymd),
  /** The technical form for the log: "вівторок 19:00 (Europe/Moscow)". */
  scheduleText(schedule) {
    return `${this.weekdayName(schedule.weekday)} ${schedule.time} (${schedule.timezone})`
  },
  /** «Кожного вівторка о 19:00» / «кожного вівторка о 19:00» */
  everyText(schedule, capital = true) {
    const every = EVERY[schedule.weekday]
    return `${capital ? every : every.toLowerCase()} о ${schedule.time}`
  },
  moveUsageText: () => "Куди перенести?\n\nПриклад: /class move 23.09 20:00\nЛише час: /class move 20:00",
  cancelUsageText: () => "Яке заняття?\n\n/class cancel - найближче\n/class cancel 23.09 - заняття вказаної дати",
  noNextClassText: () => "Найближче заняття не знайдено.\n\nРозклад: /class schedule",
  /** «19.09.2026, 12:15» - a class's date and time in sentences and cards */
  whenText(date, time) {
    return `${this.dateText(date)}${time ? `, ${time}` : ""}`
  },
  moveNoChangeText(date, time) {
    return `Заняття ${this.dateText(date)} вже о ${time}.`
  },
  /** The confirmation lines - the same under every preview. */
  confirmLinesText: (apply = false) => [`${apply ? "Застосувати" : "Підтвердити"}: /confirm`, "Передумати: /drop"],
  /** The preview of a move: a concrete date even when only a time was given. */
  movePreviewText(from, fromTime, to, time, itemCount) {
    const head = [from === to ? `Перенести заняття ${this.dateText(from)} з ${fromTime} на ${time}?` : `Перенести заняття ${this.whenText(from, fromTime)} на ${this.whenText(to, time)}?`]
    const consequence = from !== to && itemCount > 0 ? ["Завдання і файли переїдуть разом із ним.", ""] : []
    return [...head, "", ...consequence, ...this.confirmLinesText()].join("\n")
  },
  classMovedText(from, to, time) {
    return from === to ? `Заняття ${this.dateText(to)} тепер починається о ${time}.` : `Заняття ${this.dateText(from)} перенесено на ${this.whenText(to, time)}. Завдання і файли переїхали разом із ним.`
  },
  /** Before a cancellation: the consequences and the request to confirm. */
  cancelConfirmText(date, time, following, followingTime, itemCount) {
    return [
      `Скасувати заняття ${this.whenText(date, time)}?`,
      "",
      itemCount > 0 ? `Завдання і файли будуть перенесені до заняття ${this.whenText(following, followingTime)}.` : `До цього заняття поки нічого не опубліковано; наступне - ${this.whenText(following, followingTime)}.`,
      "",
      ...this.confirmLinesText(),
    ].join("\n")
  },
  /** the actions that show a preview - the same list under both "nothing to …" answers */
  previewersText: () => "Попередній перегляд дають: /class schedule, /class move, /class cancel, /vote",
  nothingToConfirmText() {
    return `Немає чого підтверджувати.\n\n${this.previewersText()}`
  },
  nothingToDropText() {
    return `Немає чого відкидати.\n\n${this.previewersText()}`
  },
  confirmationDroppedText: () => "Відкинуто, нічого не змінилося.",
  classCancelledText(date, to) {
    return `Заняття ${this.dateText(date)} скасовано. Завдання і файли перенесено на ${this.dateText(to)}.`
  },
  /** The private echo of a group announcement: what was said and where. @param {string[]} groupNames */
  announcedText: (text, groupNames) => `${text} Оголошено в ${groupNames.length === 1 ? "групі" : "групах"} ${groupNames.map((n) => `«${n}»`).join(", ")}.`,
  classAlreadyCancelledText(date) {
    return `Заняття ${this.dateText(date)} вже скасовано або перенесено.`
  },
  reminderText: (minutes, topic = null) => `Заняття почнеться за ${plural(minutes, MINUTES)}${topic ? `: ${topic}` : ""}.`,
  /** «Залишається як було: 19.09.2026, 12:15» - classes with materials keep their date and time under a new rule. @param {Array<{date, time}>} pinned */
  pinnedLinesText(pinned) {
    return pinned.length > 0 ? [pinned.length === 1 ? "Залишається як було:" : "Залишаються як були:", ...pinned.map((p) => this.whenText(p.date, p.time)), ""] : []
  },
  /** The preview of a new schedule. @param {{date, time}|null} next @param {Array<{date, time}>} [pinned] */
  schedulePreviewText(schedule, next, pinned = []) {
    return ["НОВИЙ РОЗКЛАД", "", this.everyText(schedule), `Часовий пояс: ${schedule.timezone}`, "", ...(next ? ["Найближче заняття:", this.whenText(next.date, next.time), ""] : []), ...this.pinnedLinesText(pinned), ...this.confirmLinesText(true)].join("\n")
  },
  scheduleSetText(schedule, next, pinned = []) {
    return [`Розклад змінено: ${this.everyText(schedule, false)}.`, ...(next ? [`Найближче заняття: ${this.whenText(next.date, next.time)}.`] : []), ...pinned.map((p) => `Заняття ${this.whenText(p.date, p.time)} залишається як було.`), "Минулі заняття, перенесення, скасування і матеріали збережено."].join("\n")
  },
  /** @param {{next: {date, time, movedFrom}|null, changes: Array<{kind, date, to?, time?}>}|null} outlook */
  scheduleShowText(schedule, outlook = null) {
    if (!schedule) return "Регулярний розклад поки не задано.\n\nЗадати: /class schedule <день тижня> <гг:хх>\nПриклад: /class schedule вт 19:00"
    const lines = ["РОЗКЛАД", "", this.everyText(schedule), `Часовий пояс: ${schedule.timezone}`]
    if (outlook?.next) lines.push("", "Найближче заняття:", `${this.whenText(outlook.next.date, outlook.next.time)}${outlook.next.movedFrom ? ` (перенесено з ${this.dateText(outlook.next.movedFrom)})` : ""}`)
    if (outlook?.changes.length > 0) {
      lines.push("", "Винятки:")
      for (const c of outlook.changes) {
        if (c.kind === "moved") lines.push(`${this.dateText(c.date)} · перенесено на ${this.whenText(c.to, c.time)}`)
        else if (c.kind === "cancelled") lines.push(`${this.dateText(c.date)} · скасовано`)
        else lines.push(`${this.dateText(c.date)} · початок о ${c.time}`)
      }
    }
    lines.push("", "Довідка: /class ?")
    return lines.join("\n")
  },
  scheduleUsageText: () => "Формат: /class schedule <день тижня> <гг:хх>\nПриклад: /class schedule вт 19:00",
  /** «Вересень» */
  monthName: (m) => MONTHS[m - 1],
  /** «05.09» */
  shortDateText: (ymd) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`,
  /** «16.09.2026» - the day of an instant in the bot's time zone */
  dayOfText(iso, timezone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("uk-UA", {timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric"}).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
    return `${p.day}.${p.month}.${p.year}`
  },
  postTiedText(date, time) {
    return `Допис пов'язано із заняттям ${this.whenText(date, time)}.`
  },
  /** The short schedule for the group. @param {{date, time}|null} next @param {boolean} changeAsked someone tried to change it from the group */
  scheduleBriefText(schedule, next, changeAsked = false) {
    if (!schedule) return "Регулярний розклад поки не задано."
    const lines = ["РОЗКЛАД", "", this.everyText(schedule), ...(next ? [`Найближче заняття: ${this.whenText(next.date, next.time)}`] : [])]
    if (changeAsked) lines.push("", "Змінити: в особистій бесіді, /class schedule")
    return lines.join("\n")
  },
  /** A file is on its class card now - one line in the group (recordings and readings alike). */
  savedToClassText(date, name) {
    return `Збережено до заняття ${this.dateText(date)}: ${shortFileName(name)}`
  },
  /** A private command typed in the group - one and the same line for any of them. */
  privateOnlyText: () => "Це робиться в особистій бесіді: напишіть мені або надішліть /spinoza.",
  attachFailedText: (name) => `Не вдалося додати ${name} до заняття: файла немає в архіві і завантажити його вже не можна. Надішліть файл ще раз.`,
  /** A file a class command asked for was refused: the archive is full, or its name is not allowed. @param {"full"|"unsafe"} reason */
  attachRefusedText: (name, reason) => `Не вдалося додати ${shortFileName(name)} до заняття: ${reason === "full" ? "архів заповнений" : "назва файлу зі шляхом або керуючими символами не допускається"}.`,
  recordingNeedsDateText: () => "До якого заняття? Укажіть дату: prius <дата>.",
  /** prius with no file near it (in the group). */
  noFileText(word = "prius") {
    return `Який файл? Напишіть ${word} у підписі до файлу, у відповідь на нього або одразу після того, як його надіслали.`
  },
  /** «1 допис · 2 файли · запис» or «матеріалів немає». @param {{posts, files}|null} session */
  materialsText(session) {
    if (!session) return "матеріалів немає"
    const readings = session.files.filter((f) => f.kind !== "audio").length
    const parts = [...(session.posts.length > 0 ? [plural(session.posts.length, POSTS)] : []), ...(readings > 0 ? [plural(readings, FILES)] : []), ...(session.files.some((f) => f.kind === "audio") ? ["запис"] : [])]
    return parts.length > 0 ? parts.join(" · ") : "матеріалів немає"
  },
  classStatusText: (status) => ({next: "найближче", planned: "заплановано", past: "відбулося", moved: "перенесено", cancelled: "скасовано"})[status],
  /**
   * The card of one class - only what is filled in (see domain/ClassCalendar.js classCard).
   * @param {{date, time, status, topic, posts, files, movedFrom, movedTo, schedule}} card
   * @param {{footer?: boolean}} [options] footer - the link to the list (not in the group)
   */
  classCardText(card, {footer = true} = {}) {
    const head = card.status === "next" ? "НАЙБЛИЖЧЕ ЗАНЯТТЯ" : `ЗАНЯТТЯ · ${this.classStatusText(card.status)}`
    const lines = [head, "", this.whenText(card.date, card.time)]
    if (card.topic) lines.push(`Тема: ${card.topic}`)
    if (card.movedFrom) lines.push(`Перенесено з ${this.dateText(card.movedFrom)}`)
    if (card.status === "moved") lines.push(`Перенесено на ${this.dateText(card.movedTo)}`)
    if (card.status === "cancelled") lines.push(`Завдання і файли перенесено на ${this.dateText(card.movedTo)}`)
    for (const p of card.posts) if (p.text) lines.push("", `Завдання (${p.author}${p.editedAt ? `, змінено ${this.dateText(p.editedAt.slice(0, 10))}` : ""}):`, p.text)
    const readings = card.files.filter((f) => f.kind !== "audio")
    const audio = card.files.filter((f) => f.kind === "audio")
    let n = 0 // the numbers continue across the two blocks: /д <number> refers to them (see Syllabus)
    if (readings.length > 0) lines.push("", "Файли:", ...readings.map((f) => `${++n}. ${shortFileName(f.name)}`))
    if (audio.length > 0) lines.push("", "Запис:", ...audio.map((f) => `${++n}. ${shortFileName(f.name)}`))
    if (card.posts.every((p) => !p.text) && card.files.length === 0 && card.status !== "cancelled" && card.status !== "moved") lines.push("", "Матеріалів поки немає.")
    if (card.schedule) lines.push("", `Розклад: ${this.everyText(card.schedule, false)}`)
    if (footer) lines.push("", ...(card.files.length > 0 ? ["Отримати: /д <номер>"] : []), "Усі заняття: /class list", "Довідка: /class ?")
    return lines.join("\n")
  },
  noSessionsText: () => "Занять поки немає.\n\nРозклад: /class schedule <день тижня> <гг:хх>\nУ групі: /spinoza class - позначити допис заняття",
  sessionNotFoundText: (what) => `Заняття «${what}» немає.\n\nСписок: /class list`,
  /** A list line: date, time (for future ones), topic, materials; moved and cancelled markers. @param {{date, time, status, session}} c */
  classLineText(c, {withTime = c.status === "next" || c.status === "planned", withStatus = false} = {}) {
    if (c.status === "cancelled") return `${this.shortDateText(c.date)} · скасовано`
    if (c.status === "moved") return `${this.shortDateText(c.date)} · перенесено на ${this.shortDateText(c.session.movedTo)}`
    const parts = [this.shortDateText(c.date) + (withTime && c.time ? `, ${c.time}` : "")]
    if (withStatus) parts.push(this.classStatusText(c.status))
    if (c.session?.topic) parts.push(c.session.topic)
    parts.push(this.materialsText(c.session))
    return parts.join(" · ")
  },
  /** «/class list»: a few upcoming and recent classes. @param {{upcoming, recent, year, month}} o */
  classesOverviewText({upcoming, recent, year, month}) {
    const lines = ["ЗАНЯТТЯ"]
    if (upcoming.length > 0) lines.push("", "Найближчі:", ...upcoming.map((c) => this.classLineText(c, {withTime: true})))
    if (recent.length > 0) lines.push("", "Останні:", ...recent.map((c) => this.classLineText(c, {withTime: false})))
    if (upcoming.length === 0 && recent.length === 0) lines.push("", "Занять поки немає.")
    lines.push("", `Місяць: /class list ${String(month).padStart(2, "0")}.${year}`, "Архів: /class list archive", "Довідка: /class ?")
    return lines.join("\n")
  },
  /** «/class list 09.2026»: every class of the month. @param {{year, month, items}} o */
  classesMonthText({year, month, items}) {
    const prev = month === 1 ? `12.${year - 1}` : `${String(month - 1).padStart(2, "0")}.${year}`
    const next = month === 12 ? `01.${year + 1}` : `${String(month + 1).padStart(2, "0")}.${year}`
    const body = items.length > 0 ? items.map((c) => this.classLineText(c, {withStatus: true})) : ["Занять цього місяця немає."]
    return [`ЗАНЯТТЯ · ${this.monthName(month).toUpperCase()} ${year}`, "", ...body, "", `Попередній: /class list ${prev}`, `Наступний: /class list ${next}`].join("\n")
  },
  /** «/class list 2026»: the months of a year with their counts. @param {Map<number, number>} counts */
  classesYearText(year, counts) {
    const body = counts.size > 0 ? [...counts].map(([m, n]) => `${this.monthName(m)} · ${plural(n, CLASSES)}`) : ["Занять цього року немає."]
    const last = [...counts.keys()].at(-1)
    return [`ЗАНЯТТЯ · ${year}`, "", ...body, "", `Відкрити місяць: /class list ${last ? `${String(last).padStart(2, "0")}.${year}` : "<мм.рррр>"}`].join("\n")
  },
  /** «/class list archive»: the years with their counts. @param {Map<number, number>} counts latest first */
  classesArchiveText(counts) {
    const body = counts.size > 0 ? [...counts].map(([y, n]) => `${y} · ${plural(n, CLASSES)}`) : ["Занять поки немає."]
    const years = [...counts.keys()]
    return ["АРХІВ ЗАНЯТЬ", "", ...body, "", `Відкрити рік: /class list ${years.length > 1 ? years[1] : (years[0] ?? "<рік>")}`].join("\n")
  },
  classesUsageText: (argument = null) => `Який період?\n\n/class list - найближчі та останні\n/class list 09.2026 - місяць\n/class list 2026 - рік\n/class list archive - усі роки\nОдне заняття: /class ${argument ?? "<дата>"}`,
  /** «/class ?»: the whole section. */
  classHelpText: () => [
    "ЗАНЯТТЯ",
    "",
    "/class [дата]",
    "Найближче або вказане заняття.",
    "Коротко: /з [дата]",
    "",
    "/class list [місяць|рік|архів]",
    "Список і архів занять.",
    "Коротко: /з с",
    "",
    "/class schedule [день] [час]",
    "Показати або змінити регулярний розклад.",
    "Коротко: /з р",
    "",
    "/class move <дата> [час]",
    "Перенести одне заняття.",
    "Коротко: /з п",
    "",
    "/class cancel [дата]",
    "Скасувати одне заняття.",
    "Коротко: /з о",
    "",
    "Зміни застосовуються після /confirm (/п); передумати - /drop (/о).",
    "Дати: 19.09, 2026-09-19, завтра, у пт.",
    "Файли заняття отримують за номером із картки: /д <номер>.",
    "Завдання і дописи правлять та видаляють у групі, картка оновлюється сама; файл прибирають командою /ф у <номер>.",
  ].join("\n"),
  /** «/files ?»: the whole section. */
  filesHelpText: () => [
    "ФАЙЛИ",
    "",
    "/files [шаблон]",
    "Збережені файли, новіші згори; шаблон на кшталт *.pdf звужує список.",
    "Також: /list, /ф",
    "",
    "/get <номер|назва>",
    "Отримати файл за номером зі списку або за назвою.",
    "Також: /д, /files get, /ф д",
    "",
    "/delete <номер|назва>",
    "Перемістити файл до кошика (по одному).",
    "Також: /files delete, /ф у",
    "",
    "/deleted",
    "Видалені файли; зберігаються обмежений час.",
    "Також: /files deleted, /ф к",
    "",
    "/restore <номер|назва>",
    "Повернути файл із кошика.",
    "Також: /files restore, /ф в",
    "",
    "/space",
    "Зайняте і вільне місце.",
    "Також: /files space, /ф м",
    "",
    "Номери діють за останнім показаним списком.",
  ].join("\n"),
  watchUsageText: () => "Надішліть /watch on або /watch off; без слова - покажу, чи ввімкнені вони.",
  watchStatusText: (on) => (on ? "Сповіщення про заняття ввімкнені: напишу вам особисто, коли завдання зміниться, додасться файл або з'явиться запис.\n\nВимкнути: /watch off" : "Сповіщення про заняття вимкнені.\n\nУвімкнути: /watch on"),
  sessionChangedText(date, changes) {
    const parts = []
    if (changes.some((c) => c.kind === "post")) parts.push(`новий допис (${uniqueNames(changes, "post")})`)
    if (changes.some((c) => c.kind === "edit")) parts.push(`завдання змінено (${uniqueNames(changes, "edit")})`)
    const files = changes.filter((c) => c.kind === "file")
    if (files.length > 0) parts.push(`додано файли: ${files.map((c) => shortFileName(c.name)).join(", ")}`)
    if (changes.some((c) => c.kind === "audio")) parts.push("з'явився запис")
    for (const c of changes.filter((c) => c.kind === "moved")) parts.push(`перенесено з ${this.dateText(c.from)} (${c.by})`)
    for (const c of changes.filter((c) => c.kind === "cancelled")) parts.push(`заняття ${this.dateText(c.from)} скасовано, його матеріали тепер тут (${c.by})`)
    return `Заняття ${this.dateText(date)}: ${parts.join("; ")}.\n\nДокладніше: /class ${this.shortDateText(date)}`
  },

  // ---- polls ----
  /** «16.09.2026, 18:00» in the bot's time zone */
  instantText(iso, timezone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("uk-UA", {timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
    return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}`
  },
  /** «/vote ?»: the whole section. */
  pollHelpText: () => [
    "ОПИТУВАННЯ",
    "",
    "/vote",
    "Мої активні опитування.",
    "Коротко: /г",
    "",
    "/vote <питання> | <варіант 1> | <варіант 2> [| …]",
    `Створити опитування (до ${POLL_REACTIONS.length} варіантів). Показується попередній перегляд, після /confirm воно публікується одним повідомленням у групі; учасники голосують реакціями.`,
    "Параметри: --days <число> (термін; без нього голосування закривається після 8 днів без голосів), --multiple (можна обрати кілька варіантів), --group <назва> (якщо груп кілька)",
    "",
    "/vote <номер>",
    "Стан і результати.",
    "Коротко: /г <номер>",
    "",
    "/vote close <номер>",
    "Завершити (автор або адміністратор).",
    "Коротко: /г з <номер>",
    "",
    "/vote cancel <номер>",
    "Скасувати опубліковане опитування - з підтвердженням.",
    "Коротко: /г о <номер>",
    "",
    "/vote history",
    "Завершені та скасовані.",
    "Коротко: /г и",
    "",
    "Приклад: /г Коли проведемо заняття? | Понеділок 18:30 | Вівторок 18:30 --days 3",
  ].join("\n"),
  pollNoActiveText: () => "Активних опитувань немає.\n\nСтворити: /vote <питання> | <варіант 1> | <варіант 2>\nПриклад: /vote Коли проведемо заняття? | Понеділок 18:30 | Вівторок 18:30\nДовідка: /vote ?",
  pollErrorText(code) {
    switch (code) {
      case "noSeparator":
        return "Не вдалося розділити питання і варіанти.\n\nВикористовуйте символ | :\n/vote Коли проведемо заняття? | Понеділок | Вівторок"
      case "fewOptions":
        return "Потрібні питання і щонайменше два варіанти, через | :\n/vote Коли проведемо заняття? | Понеділок | Вівторок"
      case "tooManyOptions":
        return `Забагато варіантів: реакцій вистачає на ${POLL_REACTIONS.length}.`
      default:
        return "Термін задається цілим числом днів від 1 до 365: --days 3"
    }
  },
  pollLimitText: (max) => `У вас уже ${plural(max, POLLS)}.\n\nЗакрити: /vote close <номер>`,
  pollNoGroupText: () => "Я поки не входжу до жодної групи, публікувати ніде.",
  pollGroupAmbiguousText: (names) => `Я обслуговую кілька груп - укажіть, куди публікувати: --group <назва>. Групи: ${names.join(", ")}.`,
  pollGroupUnknownText: (name, names) => `Групи «${name}» у мене немає. Групи: ${names.join(", ")}.`,
  pollOptionsText(poll, counts = null, leaders = []) {
    const mark = leaders.length > 1 ? " · порівну" : " · обрано"
    return poll.options.map((o, i) => `${POLL_REACTIONS[i]} ${o}${counts ? ` · ${counts[i]}${leaders.includes(i) ? mark : ""}` : ""}`).join("\n")
  },
  pollModeText: (poll) => (poll.multiple ? "кілька варіантів" : "один варіант"),
  pollPreviewText(poll, timezone) {
    return [
      "НОВЕ ОПИТУВАННЯ",
      "",
      poll.question,
      "",
      this.pollOptionsText(poll),
      "",
      `Режим: ${this.pollModeText(poll)}`,
      `Термін: ${poll.days ? plural(poll.days, DAYS) : (poll.idleDays ? `без обмеження; закриється після ${plural(poll.idleDays, DAYS)} без голосів` : "без обмеження")}`,
      `Група: ${poll.group.name}`,
      ...(poll.closesAt ? [`Завершення: ${this.instantText(poll.closesAt, timezone)}`] : []),
      "",
      ...this.confirmLinesText(),
    ].join("\n")
  },
  /** The message in the group: the same one is edited after every vote and at the end. */
  pollPostText(poll, {counts, participants, leaders}, timezone) {
    const closed = poll.status === "closed" || poll.status === "cancelled"
    const head = `ОПИТУВАННЯ №${poll.id}${poll.status === "closed" ? " · ЗАВЕРШЕНО" : poll.status === "cancelled" ? " · СКАСОВАНО" : ""}`
    const lines = [head, "", poll.question, "", this.pollOptionsText(poll, participants > 0 || closed ? counts : null, poll.status === "closed" ? leaders : []), ""]
    if (!closed) lines.push(poll.multiple ? "Можна обрати кілька варіантів реакціями." : "Оберіть один варіант реакцією.")
    if (participants > 0 || closed) lines.push(plural(participants, VOTES))
    const ending = closed ? `Завершено: ${this.instantText(poll.closedAt ?? poll.closesAt, timezone)}${poll.closedBy === "idle" ? ` · ${plural(poll.idleDays, DAYS)} без голосів` : ""}` : poll.closesAt ? `Завершення: ${this.instantText(poll.closesAt, timezone)}` : null
    if (ending) lines.push(ending) // a poll without a deadline says nothing about closing in the group: its author is told privately
    return lines.join("\n")
  },
  pollPublishedText: (poll) => `Опитування №${poll.id} опубліковано в групі «${poll.group.name}».${!poll.closesAt && poll.idleDays ? `\n\n${`Терміну немає: якщо ${plural(poll.idleDays, DAYS)} ніхто не голосує, голосування закриється само.`}` : ""}\n\nВідкрити: /vote ${poll.id}\n${poll.closesAt ? "Закрити достроково" : "Закрити"}: /vote close ${poll.id}`,
  pollCancelConfirmText(poll) {
    return [`Скасувати опитування №${poll.id} «${poll.question}»?`, "", "Повідомлення в групі буде позначено як скасоване.", "", ...this.confirmLinesText()].join("\n")
  },
  pollCancelledText: (poll) => `Опитування №${poll.id} скасовано.`,
  pollNotFoundText: (id) => `Опитування №${id} немає.\n\nСписок: /vote\nІсторія: /vote history`,
  pollNotOpenText: (id) => `Опитування №${id} вже завершено або скасовано.`,
  pollNotYoursText: (id) => `Опитуванням №${id} може керувати лише його автор або адміністратор.`,
  pollShowText(poll, result, timezone) {
    return this.pollPostText(poll, result, timezone) + (poll.status === "open" ? `${!poll.closesAt && poll.idleDays ? `\n\n${`Терміну немає: якщо ${plural(poll.idleDays, DAYS)} ніхто не голосує, голосування закриється само.`}` : ""}\n\n${poll.closesAt ? "Закрити достроково" : "Закрити"}: /vote close ${poll.id}` : "")
  },
  pollClosedText(poll, result, timezone) {
    return `Опитування №${poll.id} завершено.\n\n${this.pollPostText(poll, result, timezone)}`
  },
  /** The active polls: number and question, below them the votes and the deadline. */
  pollListText(items, timezone) {
    const width = Math.max(...items.map(({poll}) => String(poll.id).length))
    const rows = items.flatMap(({poll, tally: r, closesOn}) => [`${String(poll.id).padEnd(width)}  ${poll.question}`, `${" ".repeat(width)}  ${plural(r.participants, VOTES)} · ${poll.closesAt ? `до ${this.instantText(poll.closesAt, timezone)}` : closesOn ? `без голосів закриється ${this.instantText(new Date(closesOn).toISOString(), timezone)}` : "без терміну"}`, ""])
    return ["АКТИВНІ ОПИТУВАННЯ", "", ...rows, `Відкрити: /vote ${items.length === 1 ? items[0].poll.id : "<номер>"}`, "Створити: /vote <питання> | <варіант 1> | <варіант 2>", "Довідка: /vote ?"].join("\n")
  },
  pollHistoryText(items, timezone) {
    if (items.length === 0) return "Завершених опитувань поки немає.\n\nСписок: /vote"
    const width = Math.max(...items.map(({poll}) => String(poll.id).length))
    const rows = items.flatMap(({poll, tally: r}) => [`${String(poll.id).padEnd(width)}  ${poll.question}`, `${" ".repeat(width)}  ${poll.status === "cancelled" ? "скасовано" : plural(r.participants, VOTES)} · ${this.dayOfText(poll.closedAt ?? poll.closesAt ?? poll.createdAt, timezone)}`, ""])
    return [`ІСТОРІЯ ОПИТУВАНЬ · ${items.length}`, "", ...rows, "Відкрити: /vote <номер>"].join("\n")
  },
}

function uniqueNames(changes, kind) {
  return [...new Set(changes.filter((c) => c.kind === kind).map((c) => c.by))].join(", ")
}
