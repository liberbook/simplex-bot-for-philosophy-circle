import {formatSize} from "../util/format.js"
import {formatDate} from "../domain/Session.js"
import {POLL_REACTIONS} from "../domain/Poll.js"
import {fitLines, shortFileName} from "./layout.js"

/**
 * Russian texts. Same keys as en.js; the bot receives one of them as `replies`.
 * Commands in the help are written as typed - no quotes: /дай 3, /перенос 15.09 18:30;
 * <parameter> is required, [parameter] optional, alternatives are separated by |.
 * Reports (list, storage, schedule) open with a HEADING and show no zeros:
 * «материалов нет» instead of «файлов 0», «Корзина пуста» instead of «Корзина: 0».
 */

const FILES = ["файл", "файла", "файлов"]
const POSTS = ["пост", "поста", "постов"]
const DAYS = ["день", "дня", "дней"]
const VOTES = ["голос", "голоса", "голосов"]
const MINUTES = ["минуту", "минуты", "минут"]
const POLLS = ["активное голосование", "активных голосования", "активных голосований"]
const ENTRIES = ["положение", "положения", "положений"]
const CLASSES = ["занятие", "занятия", "занятий"]
const ROMAN = ["I", "II", "III", "IV", "V"]
/** plural labels of the Ethics entry types for the structure summary */
const ETHICS_TYPES = {
  определение: "Определения",
  аксиома: "Аксиомы",
  "аксиома (о телах)": "Аксиомы о телах",
  постулат: "Постулаты",
  лемма: "Леммы",
  теорема: "Теоремы",
  доказательство: "Доказательства",
  королларий: "Королларии",
  схолия: "Схолии",
  объяснение: "Объяснения",
  "определение аффекта": "Определения аффектов",
  "общее определение аффектов": "Общее определение аффектов",
  предисловие: "Предисловие",
  прибавление: "Прибавление",
  "прибавление (глава)": "Главы прибавления",
  примечание: "Примечания",
}
const EVERY = ["Каждое воскресенье", "Каждый понедельник", "Каждый вторник", "Каждую среду", "Каждый четверг", "Каждую пятницу", "Каждую субботу"]

export const ru = {
  language: "ru",
  /** «9,9 GiB» - a size with the Russian decimal comma */
  sizeText: (bytes) => formatSize(bytes).replace(".", ","),
  // the apps' command menu - the closest thing to buttons: the frequent next actions
  botCommandsSpec: `'Помощь':/?,'Файлы':/файлы,'Получить файл':/'дай <номер|имя>','Ближайшее занятие':/занятие,'Занятия':/'занятие список','Расписание':/'занятие расписание','Голосования':/голосование,'Спиноза, Этика':/'этика <ID>','Поиск в Этике':/'этика поиск <текст>','Уведомления':/уведомления,'Все команды':/??`,

  /** The greeting when the bot joins a group: a quotation and what is done in the group. @param {{latin, ref}|null} citation */
  groupGreetingText(citation) {
    return [
      ...(citation ? [citation.latin, `[${citation.ref}]`, ""] : []),
      ...this.groupFileLines(),
      "prius [дата] - связать файл с прошедшим занятием",
      "",
      "/spinoza - открыть личную беседу или получить справку",
      "/spinoza расписание - показать расписание",
      "/spinoza занятие [дата] [тема] - связать пост с занятием",
    ].join("\n")
  },
  spinozaLinkText: (link) => `Одноразовая ссылка на личную беседу:\n${link}`,
  /** What the group does with files - the same lines in the group greeting, the private greeting and every help. */
  groupFileLines() {
    return ["каждый файл группы хранится в архиве", `${this.triggerWord} - ответом на файл или сразу после него: выложу файл в группу и пришлю вам лично`]
  },
  /** The first message of a private chat the bot opens to send a requested file. */
  fileComingText: (name) => `Вы просили ${shortFileName(name)} - пришлю сюда, как только вы примете эту беседу.`,
  /** A requested file left the archive (deleted, or never downloaded) - said privately. */
  fileNotKeptText: (name) => `${shortFileName(name)} больше не хранится. Сохранённые файлы: /файлы`,
  /** The caption of a file the bot re-posts in the group for the trigger word: the requester also gets it privately. */
  fileInGroupText: (name) => `${name}, файл также в вашей личной беседе с ботом.`,
  /** The fetch word with no file near it - said privately. */
  whichFileText() {
    return `Какой файл? Напишите ${this.triggerWord} ответом на файл или сразу после того, как он выложен.`
  },
  /** A quotation before a text: every help starts with a thought of Spinoza's. */
  withQuotationText: (citation, text) => (citation ? `${citation.latin}\n[${citation.ref}]\n\n${text}` : text),
  spinozaHelpSentText: () => "Справка отправлена вам лично.",
  spinozaChatOpenedText: () => "Отправил вам запрос на личную беседу - примите его в списке чатов, справка придёт туда.",
  spinozaPendingText: () => "Запрос на личную беседу уже отправлен - примите его в списке чатов.",
  introText: () => "Я храню файлы группы, организую занятия и помогаю читать «Этику» Спинозы.",
  /** The sections of the private chat - ONE block for the greeting, /? and /spinoza (rule: the three texts never drift apart). */
  sectionLines: () => [
    "/файлы - сохранённые файлы",
    "/занятие - ближайшее занятие, расписание, перенос",
    "/голосование - голосования",
    "/этика - «Этика» Спинозы",
    "/уведомления - уведомления о занятиях",
  ],
  lettersText: () => "Команды можно сокращать до первой буквы: /ф, /з, /г, /э, /у.",
  /** The personal help for /spinoza (from the group or privately): what is done privately and what in the group. */
  spinozaHelpText(citation) {
    return [
      ...(citation ? [citation.latin, `[${citation.ref}]`, ""] : []),
      this.introText(),
      "",
      "В личной беседе:",
      ...this.sectionLines(),
      "/? - основные команды, /?? - все команды",
      this.lettersText(),
      "",
      "В группе:",
      ...this.groupFileLines(),
      "prius [дата] - связать файл с прошедшим занятием или с занятием указанной даты",
      "/spinoza расписание - показать расписание",
      "/spinoza занятие [дата] [тема] - связать пост с занятием",
      "/spinoza - эта справка в личную беседу",
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
        "Файлы и занятия доступны участникам группы, которую я обслуживаю. Что доступно вам здесь:",
        "/этика <ID> - положение из «Этики». Пример: /этика Э1т7",
        "/этика поиск <текст> - найти текст в «Этике»",
        "/? - эта справка",
      ].join("\n")
    }
    if (!full) return [this.introText(), "", ...this.sectionLines(), "", this.lettersText(), "Все команды: /??"].join("\n")
    // every operation of every section, one line each (the section help adds the details)
    const lines = [
      "ФАЙЛЫ",
      "/файлы [шаблон] - показать файлы",
      "/дай <номер|имя> - получить файл",
      "/удалить <номер|имя> - переместить в корзину",
      "/корзина - показать удалённые файлы",
      "/восстановить <номер|имя> - вернуть файл",
      "/место - использование хранилища",
      "/файлы ? - подробнее",
      "",
      "ЗАНЯТИЯ",
      "/занятие [дата] - одно занятие и его материалы",
      "/занятие список [месяц|год|архив] - списки и архив занятий",
      "/занятие расписание [день] [время] - показать или изменить расписание",
      "/занятие перенос <дата> [время] - перенести одно занятие",
      "/занятие отмена [дата] - отменить одно занятие",
      "/уведомления [вкл|выкл] - уведомления об изменениях",
      "/занятие ? - подробнее",
      "",
      "ГОЛОСОВАНИЯ",
      "/голосование - активные голосования",
      "/голосование <вопрос> | <вариант 1> | <вариант 2> - создать",
      "/голосование <номер> - состояние и результаты",
      "/голосование закрыть <номер> - завершить",
      "/голосование отменить <номер> - отменить",
      "/голосование история - завершённые",
      "/голосование ? - подробнее",
      "",
      "ЭТИКА",
      "/этика - памятка",
      "/этика [полн|всё] <ID> - положение: Э1т7, часть 1 теорема 7",
      "/этика поиск <текст> - найти",
      "/этика список <часть> - структура части",
      "/этика случайно - случайная теорема",
      "/этика ? - обозначения и режимы",
      "",
      "В ГРУППЕ",
      ...this.groupFileLines(),
      "prius [дата] - связать файл с прошедшим занятием или с занятием указанной даты (так же, как conatus)",
      "/spinoza занятие [дата] [тема] - связать пост с занятием: первой строкой поста, ответом или комментарием",
      "/spinoza расписание - показать расписание; /spinoza - справка в личную беседу",
      "",
      "ПРОЧЕЕ",
      "/статус - состояние бота",
      "/подтвердить, /отменить - принять или отбросить показанное изменение",
      "",
      "СОКРАЩЕНИЯ",
      "Первая буква раздела и первая буква операции:",
      "/д 3 = /дай 3",
      "/з 19.09 = /занятие 19.09",
      "/з п 20:00 = /занятие перенос 20:00",
      "/ф у 2 = /файлы удалить 2",
      "/г з 1 = /голосование закрыть 1",
      "/э о Э1т7 = /этика полн Э1т7",
      "/у вкл = /уведомления вкл",
      "/п и /о = /подтвердить и /отменить",
      "",
      "СПРАВКА",
      "/? - основные команды",
      "/?? - все команды (эта справка)",
      "/<раздел> ? - справка раздела: /ф ?, /з ?, /г ?, /э ?",
    ]
    // /invite and /join are intentionally NOT listed here (admins learn them from the README) - do not add them back.
    if (isAdmin) lines.push("", "АДМИНИСТРАТОР", "/админы - администраторы", "/разадмин <имя> - снять администратора")
    return lines.join("\n")
  },
  /** The greeting of a new private contact. @param {{latin, ref}|null} citation */
  greetingText(citation, isMember = true) {
    return this.withQuotationText(citation, this.helpText(false, isMember, false)) // the greeting IS the short help
  },
  /** A list line: the name (long ones shortened), size, date; an empty file is flagged instead of dated. */
  fileLineText(number, f) {
    const name = shortFileName(f.name)
    if (f.size === 0) return `${number}. ${name} · 0 B · файл пуст или не был загружен полностью`
    return `${number}. ${name} · ${this.sizeText(f.size)} · ${this.dateText(f.modifiedAt.toISOString().slice(0, 10))}`
  },
  listText(files, pattern, maxChars) {
    if (files.length === 0) return pattern ? `По шаблону «${pattern}» файлов нет.\n\nСписок: /файлы` : "Файлов пока нет."
    const head = `ФАЙЛЫ · ${files.length}${pattern ? ` · шаблон ${pattern}` : ""} · новые сверху`
    const {lines, shown} = fitLines(files, maxChars - 100, (f, n) => this.fileLineText(n, f), head.length)
    const more = shown < files.length ? [`… и ещё ${files.length - shown} - уточните: /файлы <шаблон>`] : []
    return [head, "", ...lines, ...more, "", "Получить: /дай <номер>", "Фильтр: /файлы <шаблон>", "Справка: /файлы ?"].join("\n")
  },
  notFoundText: (query) => `Файла «${query}» нет.\n\nСписок: /файлы`,
  unknownCommandText: (word, suggestion) => [`Не удалось распознать команду «${word}».`, "", ...(suggestion ? ["Возможно, вы имели в виду:", suggestion, ""] : []), "Справка: /?", "Все команды: /??"].join("\n"),
  /** Too many files for one answer: a numbered choice. @param {string[]} names */
  tooManyText(query, names, maxChars) {
    const head = `НАЙДЕНО · ${names.length} · ${query}`
    const {lines, shown} = fitLines(names, maxChars - 80, (name, n) => `${n}. ${shortFileName(name)}`, head.length)
    const more = shown < names.length ? [`… и ещё ${names.length - shown}`] : []
    return [head, "", ...lines, ...more, "", "Получить: /дай <номер>", "Уточнить: /дай <имя>"].join("\n")
  },
  getUsageText: () => "Укажите номер или имя файла.\n\nПример: /дай 3\nСписок: /файлы",
  noSuchNumberText: (number, count) => (count === 0 ? "Список ещё не показан.\n\nСписок: /файлы" : `Номера ${number} в списке нет - в нём ${count}.\n\nСписок: /файлы`),
  sendFailedText: (name) => `Извините, не удалось отправить ${name}.`,
  deniedText: () => "Извините, это доступно только участникам группы, которую я обслуживаю.\n\nЧто доступно вам: /?",

  promotionText(outcome, name) {
    switch (outcome) {
      case "granted":
        return `Добро пожаловать, ${name} - теперь вы администратор. Отправьте /??, чтобы увидеть команды администратора.`
      case "already":
        return "Вы уже администратор."
      case "disabled":
        return "Доступ администратора на этом боте не настроен."
      default:
        return "Неверный секрет."
    }
  },
  adminsOnlyText: () => "Извините, эта команда только для администраторов.",
  adminsListText: (admins) => (admins.length === 0 ? "Администраторов пока нет." : ["АДМИНИСТРАТОРЫ", "", ...admins.map((a) => `${a.name} · с ${formatDate(a.since.slice(0, 10))}`), "", "Снять: /разадмин <имя>"].join("\n")),
  deleteUsageText: () => "Укажите номер или точное имя файла, по одному за раз.\n\nПример: /удалить 3\nСписок: /файлы",
  /** @param {{classDate?: string|null, number?: number}} [o] classDate - the class card the file left; number - its number in the deleted folder now */
  deletedText(name, storedAs, {classDate = null, number = 1} = {}) {
    const head = `Файл «${shortFileName(name)}» перемещён в корзину${storedAs !== name ? ` под именем «${shortFileName(storedAs)}»` : ""}.`
    return [head, ...(classDate ? [`Убран из занятия ${this.dateText(classDate)}.`] : []), "", `Вернуть: /восстановить ${number}`, "Корзина: /корзина"].join("\n")
  },
  /** @param {"delete"|"restore"} action */
  ambiguousNameText(query, candidates, total, action = "delete") {
    const command = action === "delete" ? "/удалить" : "/восстановить"
    const head = `НАЙДЕНО · ${total} · ${query}`
    const rows = candidates.map((c, i) => `${i + 1}. ${shortFileName(c)}`)
    const more = total > candidates.length ? [`… и ещё ${total - candidates.length}`] : []
    const verb = action === "delete" ? "Удалить" : "Вернуть"
    return [head, "", ...rows, ...more, "", total === 1 ? `${verb}: ${command} 1` : `${verb} по одному: ${command} <номер>`].join("\n")
  },
  restoreUsageText: () => "Укажите номер или точное имя файла.\n\nПример: /восстановить 3\nСписок: /корзина",
  restoredText(name, storedAs, {classDate = null} = {}) {
    const head = `Файл «${shortFileName(name)}» возвращён в архив${storedAs !== name ? ` под именем «${shortFileName(storedAs)}»` : ""}.`
    return [head, ...(classDate ? [`Вернулся в занятие ${this.dateText(classDate)}.`] : []), "", "Список: /файлы"].join("\n")
  },
  deletedNotFoundText: (query) => `В корзине файла «${query}» нет.\n\nКорзина: /корзина`,
  deletedListText(files, maxChars) {
    if (files.length === 0) return "Корзина пуста."
    const head = `КОРЗИНА · ${files.length} · новые сверху`
    const {lines, shown} = fitLines(files, maxChars - 100, (f, n) => this.fileLineText(n, f), head.length)
    const more = shown < files.length ? [`… и ещё ${files.length - shown}`] : []
    return [head, "", ...lines, ...more, "", "Вернуть: /восстановить <номер>", "Справка: /файлы ?"].join("\n")
  },
  /** @param {{used, reserved, limit, free, diskFree}} usage @param {{count, bytes, retentionMs}} deleted */
  spaceText(usage, deleted) {
    const lines = ["ХРАНИЛИЩЕ", "", `Архив: ${this.sizeText(usage.used)} из ${this.sizeText(usage.limit)}`, `Свободно в архиве: ${this.sizeText(usage.free)}`]
    if (usage.reserved > 0) lines.push(`Загружается сейчас: ${this.sizeText(usage.reserved)}`)
    lines.push("", deleted.count > 0 ? `Корзина: ${this.sizeText(deleted.bytes)} · ${plural(deleted.count, FILES)}` : "Корзина пуста")
    if (deleted.retentionMs > 0) lines.push(`Срок хранения: ${plural(Math.round(deleted.retentionMs / 86_400_000), DAYS)}`)
    if (usage.diskFree !== null) lines.push("", `Свободно на диске: ${this.sizeText(usage.diskFree)}`)
    lines.push("", "Корзина: /корзина", "Справка: /файлы ?")
    return lines.join("\n")
  },
  statusText(s) {
    const hours = Math.floor(s.uptimeMs / 3_600_000)
    const minutes = Math.floor((s.uptimeMs % 3_600_000) / 60_000)
    return [
      "СОСТОЯНИЕ",
      "",
      `${s.name} ${s.version} · работает ${hours} ч ${minutes} мин`,
      `Группы: ${s.groups.length > 0 ? s.groups.map((g) => g.title).join(", ") : "пока нет"}`,
      s.fileCount > 0 ? `Архив: ${plural(s.fileCount, FILES)} · ${this.sizeText(s.usage.used)} из ${this.sizeText(s.usage.limit)}${s.usage.reserved > 0 ? ` · загружается ${this.sizeText(s.usage.reserved)}` : ""}` : `Архив пуст · лимит ${this.sizeText(s.usage.limit)}`,
      s.deleted.count > 0 ? `Корзина: ${plural(s.deleted.count, FILES)} · ${this.sizeText(s.deleted.bytes)}` : "Корзина пуста",
      s.classCount > 0 ? `Занятий: ${s.classCount}` : "Занятий пока нет",
      s.schedule ? `Расписание: ${this.everyText(s.schedule, false)}` : "Расписание не задано",
      ...(s.unknownCommands?.length > 0 ? [`Неизвестные команды: ${s.unknownCommands.map((u) => `${u.word} ×${u.count}`).join(", ")}`] : []),
      "",
      "Хранилище: /место",
    ].join("\n")
  },
  /** @param {number} minutes the window of the limit */
  slowDownText: (minutes = 1) => `Слишком много сообщений - подождите ${minutes === 1 ? "минуту" : plural(minutes, MINUTES)}, пожалуйста.`,
  adminLockedText: () => "Слишком много неверных секретов - в течение часа я не буду отвечать на /admin от вас.",
  unadminUsageText: () => "Кого снять?\n\nПример: /разадмин sam\nСписок: /админы",
  unadminDoneText: (name) => `${name} больше не администратор.\nВладельцы и администраторы группы сохраняют права по своей роли.`,
  unadminNotFoundText: (name) => `Администратора «${name}» нет.\n\nСписок: /админы`,
  inviteText: (link) => `Одноразовое приглашение в личную беседу со мной (для одного человека):\n${link}`,
  joinUsageText: () => "Какая группа?\n\nПример: /join <ссылка на группу> (ссылка из настроек группы)",
  joiningText(result, groupPattern, matches) {
    const name = result.title ? `группе «${result.title}»` : "группе"
    switch (result.status) {
      case "joined":
        return `Я уже состою в ${name}.`
      case "own":
        return "Это моя собственная ссылка."
      case "notGroupLink":
        return "Это не ссылка на группу (похоже на адрес контакта или одноразовое приглашение)."
      default: {
        const head = `Подключаюсь к ${name}… Я вступлю автоматически, как только группа меня примет; ход дела виден в моём журнале.`
        return matches ? head : `${head}\nВнимание: группа не подходит под настроенный шаблон «${groupPattern}», поэтому её файлы я не буду сохранять и раздавать.`
      }
    }
  },
  joinFailedText: (reason) => `Не удалось подключиться по этой ссылке: ${reason}`,

  /** «/этика» without parameters - the practical memo. */
  ethicsHelpText: () => `СПИНОЗА, «ЭТИКА»

Читать:
/этика Э1т7 - положение и доказательство
/этика полн Э1т7 - добавить схолии и королларии
/этика всё Э1т7 - также раскрыть связанные положения

Искать:
/этика поиск любовь

Смотреть структуру:
/этика список 3
/этика случайно

Коротко:
/э Э1т7
/э о Э1т7
/э в Э1т7
/э п любовь
/э с 3
/э л

Справка: /этика ?`,
  /** «/этика ?» - the reference of identifiers, modes and search. */
  ethicsGuideText: () => `ИДЕНТИФИКАТОРЫ «ЭТИКИ»

Э1т7       часть I, теорема 7
Э1т7док    доказательство
Э1т6кор1   первый королларий
Э1т8сх2    вторая схолия
Э1опр3     определение 3
Э1акс1     аксиома 1
Э2пост4    постулат 4
Э2лем3     лемма 3
Э3афф1     определение аффекта 1

Можно без «Э»:
1т7

Можно латиницей:
E1p7 или 1p7

РЕЖИМЫ

/этика <ID>
Положение и доказательство.

/этика полн <ID>
Добавить королларии, схолии, объяснения
и относящиеся к положению примечания.

/этика всё <ID>
Полный текст, затем тексты всех упомянутых положений.

ПОИСК

/этика поиск <текст>
/этика поиск <текст> часть <1-5>
/этика поиск <текст> тип <тип>

Примеры:
/этика поиск любовь часть 3
/этика поиск свобода тип схолия

КОРОТКИЕ ФОРМЫ

/э <ID>
/э о <ID> - полн
/э в <ID> - всё
/э п <текст> - поиск (ч <часть>, т <тип>)
/э с <часть> - список
/э л - случайно`,
  /** @param {{rid: string, meaning: string}[]} hints what the identifier may have meant */
  ethicsNotFoundText(ref, hints = []) {
    if (hints.length === 0) return `Положения «${ref}» нет.\n\nСправка: /этика ?`
    return [`Положения «${ref}» нет.`, "", "Возможные формы:", ...hints.map((h) => `${h.rid} - ${h.meaning}`), "", `Показать всё положение: /этика полн ${hints[0].rid}`].join("\n")
  },
  ethicsUnknownModeText: (word, ref) => `Не удалось распознать режим «${word}».\n\nВозможно, вы имели в виду:\n/этика полн ${ref}\n/этика всё ${ref}`,
  /** @param {{part?: number|null, type?: string|null}} [filter] what the search was limited to */
  ethicsSearchText(query, results, max, {part = null, type = null} = {}) {
    const scope = `${part ? ` · часть ${part}` : ""}${type ? ` · ${type}` : ""}`
    if (results.length === 0) return `По запросу «${query}»${scope} ничего не найдено.\n\nСправка: /этика ?`
    const shown = results.slice(0, max).map((e) => `${e.rid} (${e.type}): ${e.text.slice(0, 100)}…`)
    const more = results.length > max ? [`… и ещё ${results.length - max}`] : []
    const narrow = part === null ? [`Уточнить: /этика поиск ${query} часть <1-5>`] : []
    return [`ПОИСК В «ЭТИКЕ» · ${query}${scope} · ${results.length}`, "", ...shown, ...more, "", "Открыть: /этика <ID>", ...narrow].join("\n")
  },
  /** "Теоремы" - the plural label of an entry type in the structure summary */
  ethicsTypeLabel: (type) => ETHICS_TYPES[type] ?? type,
  /**
   * «/этика список 3» - the structure of a part: how many entries of each type, not the entries themselves.
   * @param {Array<[string, number]>} counts type -> count in reading order
   */
  ethicsListText(part, counts) {
    if (part === null) return "Какая часть?\n\nПример: /этика список 3"
    const total = counts.reduce((sum, [, n]) => sum + n, 0)
    return [`ЭТИКА · ЧАСТЬ ${ROMAN[part - 1] ?? part} · ${plural(total, ENTRIES)}`, "", ...counts.map(([type, n]) => `${this.ethicsTypeLabel(type)} · ${n}`), "", `Перечень: /этика список ${part} теоремы`, "Открыть: /этика <ID>"].join("\n")
  },
  /** «/этика список 3 теоремы» - the entries of one type with the start of their text. */
  ethicsTypeListText(part, type, entries) {
    if (entries.length === 0) return `В части ${ROMAN[part - 1] ?? part} нет положений типа «${type}».\n\nСтруктура: /этика список ${part}`
    return [`ЭТИКА · ЧАСТЬ ${ROMAN[part - 1] ?? part} · ${this.ethicsTypeLabel(entries[0].type).toUpperCase()} · ${entries.length}`, "", ...entries.map((e) => `${e.rid} - ${e.text.length > 70 ? `${e.text.slice(0, 70)}…` : e.text}`), "", "Открыть: /этика <ID>"].join("\n")
  },
  ethicsContinuedText: (i, n) => `(часть ${i} из ${n})`,
  ethicsTruncatedText: (n) => `… остальное опущено (больше ${n} сообщений). Запросите меньшие фрагменты, например /этика полн <ID>.`,

  // ---- classes ("занятия") ----
  weekdayName: (i) => ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"][i],
  dateText: (ymd) => formatDate(ymd),
  /** The technical form for the log: «вторник 19:00 (Europe/Moscow)». */
  scheduleText(schedule) {
    return `${this.weekdayName(schedule.weekday)} ${schedule.time} (${schedule.timezone})`
  },
  /** «Каждый вторник в 19:00» / «каждый вторник в 19:00» */
  everyText(schedule, capital = true) {
    const every = EVERY[schedule.weekday]
    return `${capital ? every : every.toLowerCase()} в ${schedule.time}`
  },
  moveUsageText: () => "Куда перенести?\n\nПример: /занятие перенос 23.09 20:00\nТолько время: /занятие перенос 20:00",
  cancelUsageText: () => "Какое занятие?\n\n/занятие отмена - ближайшее\n/занятие отмена 23.09 - указанной даты",
  noNextClassText: () => "Ближайшее занятие не найдено.\n\nРасписание: /занятие расписание",
  /** «19.09.2026, 12:15» - a class's date and time in sentences and cards */
  whenText(date, time) {
    return `${this.dateText(date)}${time ? `, ${time}` : ""}`
  },
  moveNoChangeText(date, time) {
    return `Занятие ${this.dateText(date)} уже стоит на ${time}.`
  },
  /** The confirmation lines - the same under every preview. */
  confirmLinesText: (apply = false) => [`${apply ? "Применить" : "Подтвердить"}: /подтвердить`, "Передумать: /отменить"],
  /** The preview of a move: a concrete date even when only a time was given. */
  movePreviewText(from, fromTime, to, time, itemCount) {
    const head = [from === to ? `Перенести занятие ${this.dateText(from)} с ${fromTime} на ${time}?` : `Перенести занятие ${this.whenText(from, fromTime)} на ${this.whenText(to, time)}?`]
    const consequence = from !== to && itemCount > 0 ? ["Задание и файлы переедут вместе с ним.", ""] : []
    return [...head, "", ...consequence, ...this.confirmLinesText()].join("\n")
  },
  classMovedText(from, to, time) {
    return from === to ? `Занятие ${this.dateText(to)} теперь в ${time}.` : `Занятие ${this.dateText(from)} перенесено на ${this.whenText(to, time)}. Задание и файлы переехали вместе с ним.`
  },
  /** Before a cancellation: the consequences and the request to confirm. */
  cancelConfirmText(date, time, following, followingTime, itemCount) {
    return [
      `Отменить занятие ${this.whenText(date, time)}?`,
      "",
      itemCount > 0 ? `Задание и файлы будут перенесены к занятию ${this.whenText(following, followingTime)}.` : `К этому занятию пока ничего не опубликовано; следующее - ${this.whenText(following, followingTime)}.`,
      "",
      ...this.confirmLinesText(),
    ].join("\n")
  },
  /** the actions that show a preview - the same list under both "nothing to …" answers */
  previewersText: () => "Предпросмотр дают: /занятие расписание, /занятие перенос, /занятие отмена, /голосование",
  nothingToConfirmText() {
    return `Нечего подтверждать.\n\n${this.previewersText()}`
  },
  nothingToDropText() {
    return `Нечего отменять.\n\n${this.previewersText()}`
  },
  confirmationDroppedText: () => "Отменено, ничего не изменилось.",
  classCancelledText(date, to) {
    return `Занятие ${this.dateText(date)} отменено. Задание и файлы перенесены на ${this.dateText(to)}.`
  },
  /** The private echo of a group announcement: what was said and where. @param {string[]} groupNames */
  announcedText: (text, groupNames) => `${text} Объявлено в ${groupNames.length === 1 ? "группе" : "группах"} ${groupNames.map((n) => `«${n}»`).join(", ")}.`,
  classAlreadyCancelledText(date) {
    return `Занятие ${this.dateText(date)} уже отменено или перенесено.`
  },
  reminderText: (minutes, topic = null) => `Занятие начнётся через ${plural(minutes, MINUTES)}${topic ? `: ${topic}` : ""}.`,
  /** «Остаётся: 19.09.2026, 12:15» - classes with materials keep their date and time under a new rule. @param {Array<{date, time}>} pinned */
  pinnedLinesText(pinned) {
    return pinned.length > 0 ? [pinned.length === 1 ? "Остаётся как было:" : "Остаются как были:", ...pinned.map((p) => this.whenText(p.date, p.time)), ""] : []
  },
  /** The preview of a new schedule. @param {{date, time}|null} next @param {Array<{date, time}>} [pinned] */
  schedulePreviewText(schedule, next, pinned = []) {
    return ["НОВОЕ РАСПИСАНИЕ", "", this.everyText(schedule), `Часовой пояс: ${schedule.timezone}`, "", ...(next ? ["Ближайшее занятие:", this.whenText(next.date, next.time), ""] : []), ...this.pinnedLinesText(pinned), ...this.confirmLinesText(true)].join("\n")
  },
  scheduleSetText(schedule, next, pinned = []) {
    return [`Расписание изменено: ${this.everyText(schedule, false)}.`, ...(next ? [`Ближайшее занятие: ${this.whenText(next.date, next.time)}.`] : []), ...pinned.map((p) => `Занятие ${this.whenText(p.date, p.time)} остаётся как было.`), "Прошедшие занятия, переносы, отмены и материалы сохранены."].join("\n")
  },
  /** @param {{next: {date, time, movedFrom}|null, changes: Array<{kind, date, to?, time?}>}|null} outlook */
  scheduleShowText(schedule, outlook = null) {
    if (!schedule) return "Регулярное расписание пока не задано.\n\nЗадать: /занятие расписание <день недели> <чч:мм>\nПример: /занятие расписание вт 19:00"
    const lines = ["РАСПИСАНИЕ", "", this.everyText(schedule), `Часовой пояс: ${schedule.timezone}`]
    if (outlook?.next) lines.push("", "Ближайшее занятие:", `${this.whenText(outlook.next.date, outlook.next.time)}${outlook.next.movedFrom ? ` (перенесено с ${this.dateText(outlook.next.movedFrom)})` : ""}`)
    if (outlook?.changes.length > 0) {
      lines.push("", "Исключения:")
      for (const c of outlook.changes) {
        if (c.kind === "moved") lines.push(`${this.dateText(c.date)} · перенесено на ${this.whenText(c.to, c.time)}`)
        else if (c.kind === "cancelled") lines.push(`${this.dateText(c.date)} · отменено`)
        else lines.push(`${this.dateText(c.date)} · начало в ${c.time}`)
      }
    }
    lines.push("", "Справка: /занятие ?")
    return lines.join("\n")
  },
  scheduleUsageText: () => "Формат: /занятие расписание <день недели> <чч:мм>\nПример: /занятие расписание вт 19:00",
  /** "Сентябрь" */
  monthName: (m) => ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"][m - 1],
  /** "05.09" */
  shortDateText: (ymd) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`,
  /** "16.09.2026" - the day of an instant in the bot's time zone */
  dayOfText(iso, timezone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("ru-RU", {timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric"}).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
    return `${p.day}.${p.month}.${p.year}`
  },
  postTiedText(date, time) {
    return `Пост связан с занятием ${this.whenText(date, time)}.`
  },
  /** The short schedule for the group. @param {{date, time}|null} next @param {boolean} changeAsked someone tried to change it from the group */
  scheduleBriefText(schedule, next, changeAsked = false) {
    if (!schedule) return "Регулярное расписание пока не задано."
    const lines = ["РАСПИСАНИЕ", "", this.everyText(schedule), ...(next ? [`Ближайшее занятие: ${this.whenText(next.date, next.time)}`] : [])]
    if (changeAsked) lines.push("", "Изменить: в личной беседе, /занятие расписание")
    return lines.join("\n")
  },
  /** A file is on its class card now - one line in the group (recordings and readings alike). */
  savedToClassText(date, name) {
    return `Сохранено в занятие ${this.dateText(date)}: ${shortFileName(name)}`
  },
  /** A private command typed in the group - one and the same line for any of them. */
  privateOnlyText: () => "Это делается в личной беседе: напишите мне или отправьте /spinoza.",
  attachFailedText: (name) => `Не удалось добавить ${name} к занятию: файла нет в архиве и скачать его уже нельзя. Выложите файл ещё раз.`,
  /** A file a class command asked for was refused: the archive is full, or its name is not allowed. @param {"full"|"unsafe"} reason */
  attachRefusedText: (name, reason) => `Не удалось добавить ${shortFileName(name)} к занятию: ${reason === "full" ? "архив заполнен" : "имя файла с путём или управляющими символами не допускается"}.`,
  recordingNeedsDateText: () => "К какому занятию? Укажите дату: prius <дата>.",
  /** prius with no file near it (in the group). */
  noFileText(word = "prius") {
    return `Какой файл? Напишите ${word} в подписи к файлу, ответом на него или сразу после того, как он выложен.`
  },
  /** «1 пост · 2 файла · запись» or «материалов нет». @param {{posts, files}|null} session */
  materialsText(session) {
    if (!session) return "материалов нет"
    const readings = session.files.filter((f) => f.kind !== "audio").length
    const parts = [...(session.posts.length > 0 ? [plural(session.posts.length, POSTS)] : []), ...(readings > 0 ? [plural(readings, FILES)] : []), ...(session.files.some((f) => f.kind === "audio") ? ["запись"] : [])]
    return parts.length > 0 ? parts.join(" · ") : "материалов нет"
  },
  classStatusText: (status) => ({next: "ближайшее", planned: "запланировано", past: "прошло", moved: "перенесено", cancelled: "отменено"})[status],
  /**
   * The card of one class - only what is filled in (see domain/ClassCalendar.js classCard).
   * @param {{date, time, status, topic, posts, files, movedFrom, movedTo, schedule}} card
   * @param {{footer?: boolean}} [options] footer - the link to the list (not in the group)
   */
  classCardText(card, {footer = true} = {}) {
    const head = card.status === "next" ? "БЛИЖАЙШЕЕ ЗАНЯТИЕ" : `ЗАНЯТИЕ · ${this.classStatusText(card.status)}`
    const lines = [head, "", this.whenText(card.date, card.time)]
    if (card.topic) lines.push(`Тема: ${card.topic}`)
    if (card.movedFrom) lines.push(`Перенесено с ${this.dateText(card.movedFrom)}`)
    if (card.status === "moved") lines.push(`Перенесено на ${this.dateText(card.movedTo)}`)
    if (card.status === "cancelled") lines.push(`Задание и файлы перенесены на ${this.dateText(card.movedTo)}`)
    for (const p of card.posts) if (p.text) lines.push("", `Задание (${p.author}${p.editedAt ? `, изменено ${formatDate(p.editedAt.slice(0, 10))}` : ""}):`, p.text)
    const readings = card.files.filter((f) => f.kind !== "audio")
    const audio = card.files.filter((f) => f.kind === "audio")
    let n = 0 // the numbers continue across the two blocks: /д <номер> refers to them (see Syllabus)
    if (readings.length > 0) lines.push("", "Файлы:", ...readings.map((f) => `${++n}. ${shortFileName(f.name)}`))
    if (audio.length > 0) lines.push("", "Запись:", ...audio.map((f) => `${++n}. ${shortFileName(f.name)}`))
    if (card.posts.every((p) => !p.text) && card.files.length === 0 && card.status !== "cancelled" && card.status !== "moved") lines.push("", "Материалов пока нет.")
    if (card.schedule) lines.push("", `Расписание: ${this.everyText(card.schedule, false)}`)
    if (footer) lines.push("", ...(card.files.length > 0 ? ["Получить: /д <номер>"] : []), "Все занятия: /занятие список", "Справка: /занятие ?")
    return lines.join("\n")
  },
  noSessionsText: () => "Занятий пока нет.\n\nРасписание: /занятие расписание <день недели> <чч:мм>\nВ группе: /spinoza занятие - отметить пост занятия",
  sessionNotFoundText: (what) => `Занятия «${what}» нет.\n\nСписок: /занятие список`,
  /** A list line: date, time (for future ones), topic, materials; moved and cancelled markers. @param {{date, time, status, session}} c */
  classLineText(c, {withTime = c.status === "next" || c.status === "planned", withStatus = false} = {}) {
    if (c.status === "cancelled") return `${this.shortDateText(c.date)} · отменено`
    if (c.status === "moved") return `${this.shortDateText(c.date)} · перенесено на ${this.shortDateText(c.session.movedTo)}`
    const parts = [this.shortDateText(c.date) + (withTime && c.time ? `, ${c.time}` : "")]
    if (withStatus) parts.push(this.classStatusText(c.status))
    if (c.session?.topic) parts.push(c.session.topic)
    parts.push(this.materialsText(c.session))
    return parts.join(" · ")
  },
  /** «/занятия»: a few upcoming and recent classes. @param {{upcoming, recent, year, month}} o */
  classesOverviewText({upcoming, recent, year, month}) {
    const lines = ["ЗАНЯТИЯ"]
    if (upcoming.length > 0) lines.push("", "Ближайшие:", ...upcoming.map((c) => this.classLineText(c, {withTime: true})))
    if (recent.length > 0) lines.push("", "Последние:", ...recent.map((c) => this.classLineText(c, {withTime: false})))
    if (upcoming.length === 0 && recent.length === 0) lines.push("", "Занятий пока нет.")
    lines.push("", `Месяц: /занятие список ${String(month).padStart(2, "0")}.${year}`, "Архив: /занятие список архив", "Справка: /занятие ?")
    return lines.join("\n")
  },
  /** «/занятия 09.2026»: every class of the month. @param {{year, month, items}} o */
  classesMonthText({year, month, items}) {
    const prev = month === 1 ? `12.${year - 1}` : `${String(month - 1).padStart(2, "0")}.${year}`
    const next = month === 12 ? `01.${year + 1}` : `${String(month + 1).padStart(2, "0")}.${year}`
    const body = items.length > 0 ? items.map((c) => this.classLineText(c, {withStatus: true})) : ["Занятий в этом месяце нет."]
    return [`ЗАНЯТИЯ · ${this.monthName(month).toUpperCase()} ${year}`, "", ...body, "", `Предыдущий: /занятие список ${prev}`, `Следующий: /занятие список ${next}`].join("\n")
  },
  /** «/занятия 2026»: the months of a year with their counts. @param {Map<number, number>} counts */
  classesYearText(year, counts) {
    const body = counts.size > 0 ? [...counts].map(([m, n]) => `${this.monthName(m)} · ${plural(n, CLASSES)}`) : ["Занятий в этом году нет."]
    const last = [...counts.keys()].at(-1)
    return [`ЗАНЯТИЯ · ${year}`, "", ...body, "", `Открыть месяц: /занятие список ${last ? `${String(last).padStart(2, "0")}.${year}` : "<мм.гггг>"}`].join("\n")
  },
  /** «/занятия архив»: the years with their counts. @param {Map<number, number>} counts latest first */
  classesArchiveText(counts) {
    const body = counts.size > 0 ? [...counts].map(([y, n]) => `${y} · ${plural(n, CLASSES)}`) : ["Занятий пока нет."]
    const years = [...counts.keys()]
    return ["АРХИВ ЗАНЯТИЙ", "", ...body, "", `Открыть год: /занятие список ${years.length > 1 ? years[1] : (years[0] ?? "<год>")}`].join("\n")
  },
  classesUsageText: (argument = null) => `Какой период?\n\n/занятие список - ближайшие и последние\n/занятие список 09.2026 - месяц\n/занятие список 2026 - год\n/занятие список архив - все годы\nОдно занятие: /занятие ${argument ?? "<дата>"}`,
  /** «/занятие ?»: the whole section. */
  classHelpText: () => [
    "ЗАНЯТИЯ",
    "",
    "/занятие [дата]",
    "Ближайшее или указанное занятие.",
    "Коротко: /з [дата]",
    "",
    "/занятие список [месяц|год|архив]",
    "Список и архив занятий.",
    "Коротко: /з с",
    "",
    "/занятие расписание [день] [время]",
    "Показать или изменить регулярное расписание.",
    "Коротко: /з р",
    "",
    "/занятие перенос <дата> [время]",
    "Перенести одно занятие.",
    "Коротко: /з п",
    "",
    "/занятие отмена [дата]",
    "Отменить одно занятие.",
    "Коротко: /з о",
    "",
    "Изменения применяются после /подтвердить (/п); передумать - /отменить (/о).",
    "Даты: 19.09, 19 сентября, 2026-09-19, сегодня, завтра, в пятницу.",
    "Файлы занятия получают по номеру из карточки: /д <номер>.",
    "Задание и посты правятся и удаляются в группе, карточка обновляется сама; файл убирается командой /ф у <номер>.",
  ].join("\n"),
  /** «/файлы ?»: the whole section. */
  filesHelpText: () => [
    "ФАЙЛЫ",
    "",
    "/файлы [шаблон]",
    "Сохранённые файлы, новые сверху; шаблон вроде *.pdf сужает список.",
    "Также: /список, /ф",
    "",
    "/дай <номер|имя>",
    "Получить файл по номеру из списка или по имени.",
    "Также: /д, /файлы дай, /ф д",
    "",
    "/удалить <номер|имя>",
    "Переместить файл в корзину (по одному).",
    "Также: /файлы удалить, /ф у",
    "",
    "/корзина",
    "Удалённые файлы; хранятся ограниченное время.",
    "Также: /файлы корзина, /ф к",
    "",
    "/восстановить <номер|имя>",
    "Вернуть файл из корзины.",
    "Также: /файлы восстановить, /ф в",
    "",
    "/место",
    "Занятое и свободное место.",
    "Также: /файлы место, /ф м",
    "",
    "Номера действуют по последнему показанному списку.",
  ].join("\n"),
  watchUsageText: () => "Отправьте /уведомления вкл или /уведомления выкл; без слова - покажу, включены ли они.",
  watchStatusText: (on) => (on ? "Уведомления о занятиях включены: напишу в личку, когда задание изменится, добавится файл или появится запись.\n\nОтключить: /уведомления выкл" : "Уведомления о занятиях отключены.\n\nВключить: /уведомления вкл"),
  sessionChangedText(date, changes) {
    const parts = []
    if (changes.some((c) => c.kind === "post")) parts.push(`новый пост (${uniqueNames(changes, "post")})`)
    if (changes.some((c) => c.kind === "edit")) parts.push(`задание изменено (${uniqueNames(changes, "edit")})`)
    const files = changes.filter((c) => c.kind === "file")
    if (files.length > 0) parts.push(`добавлены файлы: ${files.map((c) => shortFileName(c.name)).join(", ")}`)
    if (changes.some((c) => c.kind === "audio")) parts.push("выложена запись")
    for (const c of changes.filter((c) => c.kind === "moved")) parts.push(`перенесено с ${this.dateText(c.from)} (${c.by})`)
    for (const c of changes.filter((c) => c.kind === "cancelled")) parts.push(`занятие ${this.dateText(c.from)} отменено, его материалы теперь здесь (${c.by})`)
    return `Занятие ${this.dateText(date)}: ${parts.join("; ")}.\n\nПодробности: /занятие ${this.shortDateText(date)}`
  },

  // ---- polls ----
  /** «16.09.2026, 18:00» in the bot's time zone */
  instantText(iso, timezone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("ru-RU", {timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
    return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}`
  },
  /** «/голосование ?»: the whole section. */
  pollHelpText: () => [
    "ГОЛОСОВАНИЯ",
    "",
    "/голосование",
    "Мои активные голосования.",
    "Коротко: /г",
    "",
    "/голосование <вопрос> | <вариант 1> | <вариант 2> [| …]",
    `Создать голосование (до ${POLL_REACTIONS.length} вариантов). Показывается предпросмотр, публикуется после /подтвердить одним сообщением в группе; участники голосуют реакциями.`,
    "Параметры: --дней <число> (срок; без него голосование закрывается после 8 дней без голосов), --несколько (можно выбрать несколько вариантов), --группа <имя> (если групп несколько)",
    "",
    "/голосование <номер>",
    "Состояние и результаты.",
    "Коротко: /г <номер>",
    "",
    "/голосование закрыть <номер>",
    "Завершить (автор или администратор).",
    "Коротко: /г з <номер>",
    "",
    "/голосование отменить <номер>",
    "Отменить опубликованное голосование - с подтверждением.",
    "Коротко: /г о <номер>",
    "",
    "/голосование история",
    "Завершённые и отменённые.",
    "Коротко: /г и",
    "",
    "Пример: /г Когда провести занятие? | Понедельник 18:30 | Вторник 18:30 --дней 3",
  ].join("\n"),
  pollNoActiveText: () => "Активных голосований нет.\n\nСоздать: /голосование <вопрос> | <вариант 1> | <вариант 2>\nПример: /голосование Когда провести занятие? | Понедельник 18:30 | Вторник 18:30\nСправка: /голосование ?",
  pollErrorText(code) {
    switch (code) {
      case "noSeparator":
        return "Не удалось разделить вопрос и варианты.\n\nИспользуйте символ | :\n/голосование Когда провести занятие? | Понедельник | Вторник"
      case "fewOptions":
        return "Нужны вопрос и минимум два варианта, через | :\n/голосование Когда провести занятие? | Понедельник | Вторник"
      case "tooManyOptions":
        return `Слишком много вариантов: реакций хватает на ${POLL_REACTIONS.length}.`
      default:
        return "Срок задаётся целым числом дней от 1 до 365: --дней 3"
    }
  },
  pollLimitText: (max) => `У вас уже ${plural(max, POLLS)}.\n\nЗакрыть: /голосование закрыть <номер>`,
  pollNoGroupText: () => "Я пока не состою ни в одной группе, публиковать негде.",
  pollGroupAmbiguousText: (names) => `Я обслуживаю несколько групп - укажите, куда публиковать: --группа <имя>. Группы: ${names.join(", ")}.`,
  pollGroupUnknownText: (name, names) => `Группы «${name}» у меня нет. Группы: ${names.join(", ")}.`,
  pollOptionsText(poll, counts = null, leaders = []) {
    const mark = leaders.length > 1 ? " · поровну" : " · выбрано"
    return poll.options.map((o, i) => `${POLL_REACTIONS[i]} ${o}${counts ? ` · ${counts[i]}${leaders.includes(i) ? mark : ""}` : ""}`).join("\n")
  },
  pollModeText: (poll) => (poll.multiple ? "несколько вариантов" : "один вариант"),
  pollPreviewText(poll, timezone) {
    return [
      "НОВОЕ ГОЛОСОВАНИЕ",
      "",
      poll.question,
      "",
      this.pollOptionsText(poll),
      "",
      `Режим: ${this.pollModeText(poll)}`,
      `Срок: ${poll.days ? plural(poll.days, DAYS) : (poll.idleDays ? `без ограничения; закроется после ${plural(poll.idleDays, DAYS)} без голосов` : "без ограничения")}`,
      `Группа: ${poll.group.name}`,
      ...(poll.closesAt ? [`Завершение: ${this.instantText(poll.closesAt, timezone)}`] : []),
      "",
      ...this.confirmLinesText(),
    ].join("\n")
  },
  /** The message in the group: the same one is edited after every vote and at the end. */
  pollPostText(poll, {counts, participants, leaders}, timezone) {
    const closed = poll.status === "closed" || poll.status === "cancelled"
    const head = `ГОЛОСОВАНИЕ №${poll.id}${poll.status === "closed" ? " · ЗАВЕРШЕНО" : poll.status === "cancelled" ? " · ОТМЕНЕНО" : ""}`
    const lines = [head, "", poll.question, "", this.pollOptionsText(poll, participants > 0 || closed ? counts : null, poll.status === "closed" ? leaders : []), ""]
    if (!closed) lines.push(poll.multiple ? "Можно выбрать несколько вариантов реакциями." : "Выберите один вариант реакцией.")
    if (participants > 0 || closed) lines.push(plural(participants, VOTES))
    const ending = closed ? `Завершено: ${this.instantText(poll.closedAt ?? poll.closesAt, timezone)}${poll.closedBy === "idle" ? ` · ${plural(poll.idleDays, DAYS)} без голосов` : ""}` : poll.closesAt ? `Завершение: ${this.instantText(poll.closesAt, timezone)}` : null
    if (ending) lines.push(ending) // a poll without a deadline says nothing about closing in the group: its author is told privately
    return lines.join("\n")
  },
  pollPublishedText: (poll) => `Голосование №${poll.id} опубликовано в группе «${poll.group.name}».${!poll.closesAt && poll.idleDays ? `\n\n${`Срока нет: если ${plural(poll.idleDays, DAYS)} никто не голосует, голосование закроется само.`}` : ""}\n\nОткрыть: /голосование ${poll.id}\n${poll.closesAt ? "Закрыть досрочно" : "Закрыть"}: /голосование закрыть ${poll.id}`,
  pollCancelConfirmText(poll) {
    return [`Отменить голосование №${poll.id} «${poll.question}»?`, "", "Сообщение в группе будет помечено как отменённое.", "", ...this.confirmLinesText()].join("\n")
  },
  pollCancelledText: (poll) => `Голосование №${poll.id} отменено.`,
  pollNotFoundText: (id) => `Голосования №${id} нет.\n\nСписок: /голосование\nИстория: /голосование история`,
  pollNotOpenText: (id) => `Голосование №${id} уже завершено или отменено.`,
  pollNotYoursText: (id) => `Голосованием №${id} может управлять только его автор или администратор.`,
  pollShowText(poll, result, timezone) {
    return this.pollPostText(poll, result, timezone) + (poll.status === "open" ? `${!poll.closesAt && poll.idleDays ? `\n\n${`Срока нет: если ${plural(poll.idleDays, DAYS)} никто не голосует, голосование закроется само.`}` : ""}\n\n${poll.closesAt ? "Закрыть досрочно" : "Закрыть"}: /голосование закрыть ${poll.id}` : "")
  },
  pollClosedText(poll, result, timezone) {
    return `Голосование №${poll.id} завершено.\n\n${this.pollPostText(poll, result, timezone)}`
  },
  /** The active polls: number and question, below them the votes and the deadline. */
  pollListText(items, timezone) {
    const width = Math.max(...items.map(({poll}) => String(poll.id).length))
    const rows = items.flatMap(({poll, tally: r, closesOn}) => [`${String(poll.id).padEnd(width)}  ${poll.question}`, `${" ".repeat(width)}  ${plural(r.participants, VOTES)} · ${poll.closesAt ? `до ${this.instantText(poll.closesAt, timezone)}` : closesOn ? `без голосов закроется ${this.instantText(new Date(closesOn).toISOString(), timezone)}` : "без срока"}`, ""])
    return ["АКТИВНЫЕ ГОЛОСОВАНИЯ", "", ...rows, `Открыть: /голосование ${items.length === 1 ? items[0].poll.id : "<номер>"}`, "Создать: /голосование <вопрос> | <вариант 1> | <вариант 2>", "Справка: /голосование ?"].join("\n")
  },
  pollHistoryText(items, timezone) {
    if (items.length === 0) return "Завершённых голосований пока нет.\n\nСписок: /голосование"
    const width = Math.max(...items.map(({poll}) => String(poll.id).length))
    const rows = items.flatMap(({poll, tally: r}) => [`${String(poll.id).padEnd(width)}  ${poll.question}`, `${" ".repeat(width)}  ${poll.status === "cancelled" ? "отменено" : plural(r.participants, VOTES)} · ${this.dayOfText(poll.closedAt ?? poll.closesAt ?? poll.createdAt, timezone)}`, ""])
    return [`ИСТОРИЯ ГОЛОСОВАНИЙ · ${items.length}`, "", ...rows, "Открыть: /голосование <номер>"].join("\n")
  },
}

function uniqueNames(changes, kind) {
  return [...new Set(changes.filter((c) => c.kind === kind).map((c) => c.by))].join(", ")
}

/** «1 файл», «2 файла», «5 файлов» */
function plural(n, [one, few, many]) {
  const m10 = n % 10
  const m100 = n % 100
  const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
  return `${n} ${word}`
}
