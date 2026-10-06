/**
 * Parsing of the commands users send to the bot. In a private chat the slash
 * is optional ("/list" or "list"); in the group parsing is strict (see
 * parseGroupCommand) and "/spinoza [<subcommand>]" wraps the group commands.
 */
export const CommandKind = Object.freeze({
  HELP: "help",
  LIST: "list",
  GET: "get", // member: a file by name, pattern or its number in the last /list
  ADMIN: "admin", // become admin with the secret
  DELETE: "delete", // member: move a file (number or name) to the deleted folder
  SPACE: "space", // member: archive usage and free space
  ADMINS: "admins", // admin: who the admins are
  INVITE: "invite", // admin: one-time link for a private chat with the bot - deliberately absent from the help (admins learn it from the README); do not list it
  SPINOZA: "spinoza", // group: the entry point - a one-time link or the help sent privately; "/spinoza <subcommand>" wraps the group commands
  JOIN: "join", // admin: make the bot join a group via its link - deliberately absent from the help like INVITE
  ETHICS: "ethics", // Spinoza's Ethics
  RESTORE: "restore", // member: move a file (number or name) back from the deleted folder
  DELETED: "deleted", // member: list the deleted folder
  UNADMIN: "unadmin", // admin: remove an admin
  STATUS: "status", // member: version, uptime, groups, storage
  SESSION: "session", // group: this post (or the quoted one) belongs to a class; private: the "/занятие" section (see resolveClassCommand)
  CLASS_HELP: "classHelp", // private: "/занятие ?" - the help of the class section
  FILES: "files", // private: the "/файлы" section (see resolveFileCommand); alone = LIST
  FILES_HELP: "filesHelp", // private: "/файлы ?"
  DROP: "drop", // private: "/отменить" - forget the previewed action that waits for /подтвердить
  LAST: "last", // group: "prius" - this file (or the quoted / preceding one) belongs to the last class
  MOVE: "move", // private: move the next class to another date and/or time
  CANCEL: "cancel", // private: cancel a class - its materials go to the following one (asks for confirmation)
  CONFIRM: "confirm", // private: "/подтвердить" - carry out the previewed action (schedule, move, cancellation, poll)
  SCHEDULE: "schedule", // weekly class schedule (any member, in the group or privately)
  HOMEWORK: "homework", // private: the next class - homework text and files
  SESSIONS: "sessions", // private: list of classes
  WATCH: "watch", // private: notifications about class changes - "/уведомления [вкл|выкл]"
  VOTE: "vote", // private: polls - "/голосование ..." (see domain/Poll.js)
  UNKNOWN: "unknown",
})

/** Commands that require admin rights (except ADMIN itself, which grants them). */
export const ADMIN_COMMANDS = new Set([CommandKind.ADMIN, CommandKind.ADMINS, CommandKind.UNADMIN, CommandKind.INVITE, CommandKind.JOIN])

/** Archive maintenance and reports: any member of the served group (handled by the Administrator). */
export const MAINTENANCE_COMMANDS = new Set([CommandKind.DELETE, CommandKind.RESTORE, CommandKind.DELETED, CommandKind.SPACE, CommandKind.STATUS])

/**
 * Command words. Every section and every frequent action also has a ONE-LETTER
 * Russian form (the first letter): /ф /з /г /э /у /с /д /п /о and /? - the help;
 * the sections also answer to the Latin letter of their English name: /f /c /v /e /w.
 * The texts advertise them ("Команды можно сокращать до первой буквы"). The help is
 * shown as "?" everywhere ("??" = all commands, "/<раздел> ?" = a section's help);
 * the words help / помощь / справка keep working but are not advertised.
 */
const ALIASES = new Map([
  ["?", CommandKind.HELP],
  ["??", CommandKind.HELP], // all commands (parseCommand turns it into "? all")
  ["help", CommandKind.HELP],
  ["h", CommandKind.HELP],
  ["start", CommandKind.HELP],
  ["list", CommandKind.LIST],
  ["ls", CommandKind.LIST],
  ["files", CommandKind.FILES],
  ["get", CommandKind.GET],
  ["download", CommandKind.GET],
  ["admin", CommandKind.ADMIN],
  ["delete", CommandKind.DELETE],
  ["del", CommandKind.DELETE],
  ["rm", CommandKind.DELETE],
  ["space", CommandKind.SPACE],
  ["df", CommandKind.SPACE],
  ["admins", CommandKind.ADMINS],
  ["invite", CommandKind.INVITE],
  ["spinoza", CommandKind.SPINOZA],
  ["join", CommandKind.JOIN],
  ["ethics", CommandKind.ETHICS],
  ["restore", CommandKind.RESTORE],
  ["undelete", CommandKind.RESTORE],
  ["deleted", CommandKind.DELETED],
  ["trash", CommandKind.DELETED],
  ["unadmin", CommandKind.UNADMIN],
  ["status", CommandKind.STATUS],
  ["session", CommandKind.SESSION],
  ["class", CommandKind.SESSION],
  ["prius", CommandKind.LAST],
  ["last", CommandKind.LAST], // not shown in the help
  ["move", CommandKind.MOVE],
  ["cancel", CommandKind.CANCEL],
  ["confirm", CommandKind.CONFIRM],
  ["drop", CommandKind.DROP],
  ["undo", CommandKind.DROP],
  ["schedule", CommandKind.SCHEDULE],
  ["homework", CommandKind.HOMEWORK],
  ["hw", CommandKind.HOMEWORK],
  ["sessions", CommandKind.SESSIONS],
  ["classes", CommandKind.SESSIONS],
  ["watch", CommandKind.WATCH],
  ["subscribe", CommandKind.WATCH],
  ["notifications", CommandKind.WATCH],
  ["vote", CommandKind.VOTE],
  ["poll", CommandKind.VOTE],
  // Russian: the main form, one short alias
  ["помощь", CommandKind.HELP],
  ["справка", CommandKind.HELP],
  ["список", CommandKind.LIST],
  ["сп", CommandKind.LIST],
  ["файлы", CommandKind.FILES],
  ["ф", CommandKind.FILES],
  ["f", CommandKind.FILES], // Latin one-letter forms of the sections, for the languages that are not Russian
  ["дай", CommandKind.GET],
  ["д", CommandKind.GET],
  ["получить", CommandKind.GET],
  ["скачать", CommandKind.GET],
  ["админ", CommandKind.ADMIN],
  ["удалить", CommandKind.DELETE],
  ["место", CommandKind.SPACE],
  ["админы", CommandKind.ADMINS],
  ["пригласить", CommandKind.INVITE],
  ["спиноза", CommandKind.SPINOZA],
  ["войти", CommandKind.JOIN],
  ["этика", CommandKind.ETHICS],
  ["э", CommandKind.ETHICS],
  ["e", CommandKind.ETHICS],
  ["восстановить", CommandKind.RESTORE],
  ["корзина", CommandKind.DELETED],
  ["удалённые", CommandKind.DELETED],
  ["разадмин", CommandKind.UNADMIN],
  ["статус", CommandKind.STATUS],
  ["с", CommandKind.STATUS],
  ["занятие", CommandKind.SESSION],
  ["з", CommandKind.SESSION],
  ["c", CommandKind.SESSION],
  ["прошлое", CommandKind.LAST],
  ["прошедшее", CommandKind.LAST],
  ["перенос", CommandKind.MOVE],
  ["перенести", CommandKind.MOVE],
  ["пер", CommandKind.MOVE],
  ["отмена", CommandKind.CANCEL],
  ["отм", CommandKind.CANCEL],
  ["отменить", CommandKind.DROP],
  ["о", CommandKind.DROP],
  ["подтвердить", CommandKind.CONFIRM],
  ["п", CommandKind.CONFIRM],
  ["расписание", CommandKind.SCHEDULE],
  ["расп", CommandKind.SCHEDULE],
  ["дз", CommandKind.HOMEWORK],
  ["задание", CommandKind.HOMEWORK],
  ["занятия", CommandKind.SESSIONS],
  ["зан", CommandKind.SESSIONS],
  ["уведомления", CommandKind.WATCH],
  ["ув", CommandKind.WATCH],
  ["у", CommandKind.WATCH],
  ["w", CommandKind.WATCH],
  ["следить", CommandKind.WATCH],
  ["голосование", CommandKind.VOTE],
  ["гол", CommandKind.VOTE],
  ["г", CommandKind.VOTE],
  ["v", CommandKind.VOTE],
])

/**
 * Words after "/spinoza" that stand for a group command; anything else (help,
 * ?, all, nothing) stays SPINOZA. Moving and cancelling classes are private-chat
 * commands on purpose - the group keeps only what must happen there.
 */
const SPINOZA_SUBCOMMANDS = new Map([
  ...["занятие", "class", "session"].map((w) => [w, CommandKind.SESSION]),
  ...["расписание", "расп", "schedule"].map((w) => [w, CommandKind.SCHEDULE]),
  ...["прошедшее", "prius", "last"].map((w) => [w, CommandKind.LAST]),
])

/**
 * @param {string} text
 * @returns {{kind: string, argument: string}}
 */
export function parseCommand(text) {
  const trimmed = (text ?? "").trim().replace(/^\//, "")
  const [word = "", ...rest] = trimmed.split(/\s+/)
  const kind = ALIASES.get(word.toLowerCase()) ?? CommandKind.UNKNOWN
  const argument = rest.join(" ").trim()
  if (word === "??") return {kind, argument: argument || "all"}
  return {kind, argument}
}

/**
 * The private "/занятие" section: one
 * word after "/занятие" (or "/з") picks the operation - list, schedule, move,
 * cancel, confirm, help - and anything else is a date for the class card.
 */
const CLASS_SUBCOMMANDS = new Map([
  ...["список", "с", "list"].map((w) => [w, CommandKind.SESSIONS]),
  ...["расписание", "расп", "р", "schedule"].map((w) => [w, CommandKind.SCHEDULE]),
  ...["перенос", "перенести", "п", "move"].map((w) => [w, CommandKind.MOVE]),
  ...["отмена", "о", "cancel"].map((w) => [w, CommandKind.CANCEL]),
  ...["отменить", "drop"].map((w) => [w, CommandKind.DROP]),
  ...["подтвердить", "confirm"].map((w) => [w, CommandKind.CONFIRM]),
  ...["помощь", "справка", "help", "?"].map((w) => [w, CommandKind.CLASS_HELP]),
])

/**
 * The private "/файлы" section: one word after "/файлы" (or "/ф") picks the
 * operation; anything else is a pattern for the list.
 */
const FILE_SUBCOMMANDS = new Map([
  ...["список", "с", "list"].map((w) => [w, CommandKind.LIST]),
  ...["дай", "д", "get"].map((w) => [w, CommandKind.GET]),
  ...["удалить", "у", "delete"].map((w) => [w, CommandKind.DELETE]),
  ...["корзина", "к", "deleted"].map((w) => [w, CommandKind.DELETED]),
  ...["восстановить", "в", "restore"].map((w) => [w, CommandKind.RESTORE]),
  ...["место", "м", "space"].map((w) => [w, CommandKind.SPACE]),
  ...["помощь", "справка", "help", "?"].map((w) => [w, CommandKind.FILES_HELP]),
])

/**
 * Resolves a private "/занятие ..." command to the operation it stands for;
 * every other command is returned unchanged. "/занятие [date]" is the class card (HOMEWORK).
 * @param {{kind: string, argument: string}} command
 */
export function resolveClassCommand(command) {
  return resolveSubcommand(command, CommandKind.SESSION, CLASS_SUBCOMMANDS, CommandKind.HOMEWORK)
}

/** Resolves a private "/файлы ..." command; "/файлы [pattern]" is the list. */
export function resolveFileCommand(command) {
  return resolveSubcommand(command, CommandKind.FILES, FILE_SUBCOMMANDS, CommandKind.LIST)
}

/** Both sections at once - what the private-chat handlers parse with. */
export function resolveSection(command) {
  return resolveFileCommand(resolveClassCommand(command))
}

function resolveSubcommand(command, section, subcommands, fallback) {
  if (command.kind !== section) return command
  const [sub = "", ...rest] = command.argument.split(/\s+/)
  const kind = subcommands.get(sub.toLowerCase())
  return kind ? {kind, argument: rest.join(" ").trim()} : {kind: fallback, argument: command.argument}
}

/**
 * The form of each command shown in corrective hints (Russian main form; English
 * where there is no Russian one). Admin commands are absent on purpose: a hint
 * goes to whoever mistyped, and users must not learn admin commands from it.
 */
const SHOWN_AS = new Map([
  [CommandKind.HELP, "/?"],
  [CommandKind.FILES, "/файлы [шаблон]"],
  [CommandKind.LIST, "/список [шаблон]"],
  [CommandKind.GET, "/дай <номер|имя>"],
  [CommandKind.DELETE, "/удалить <номер|имя>"],
  [CommandKind.RESTORE, "/восстановить <номер|имя>"],
  [CommandKind.DELETED, "/корзина"],
  [CommandKind.SPACE, "/место"],
  [CommandKind.STATUS, "/статус"],
  [CommandKind.ETHICS, "/этика <ID>"],
  [CommandKind.SESSION, "/занятие [дата]"],
  [CommandKind.HOMEWORK, "/занятие [дата]"],
  [CommandKind.SESSIONS, "/занятие список [месяц|год|архив]"],
  [CommandKind.SCHEDULE, "/занятие расписание [день] [время]"],
  [CommandKind.MOVE, "/занятие перенос <дата> [время]"],
  [CommandKind.CANCEL, "/занятие отмена [дата]"],
  [CommandKind.CONFIRM, "/подтвердить"],
  [CommandKind.DROP, "/отменить"],
  [CommandKind.WATCH, "/уведомления [вкл|выкл]"],
  [CommandKind.VOTE, "/голосование"],
])

/**
 * The command a mistyped word most likely meant ("/лист" -> "/список"): an
 * alias within two edits, or one the word is a prefix of. Only private-chat
 * commands are suggested. @returns {string|null} how to type it
 */
export function suggestCommand(word) {
  const w = String(word ?? "").replace(/^\//, "").toLowerCase()
  if (!/^\p{L}{2,}$/u.test(w)) return null // "?" and "??" are the help, not a typo
  let best = null
  for (const [alias, kind] of ALIASES) {
    if (!SHOWN_AS.has(kind) || !/^\p{L}{2,}$/u.test(alias)) continue // one-letter forms and "?" would match any typo
    const distance = alias.startsWith(w) || w.startsWith(alias) ? 1 : editDistance(w, alias)
    if (distance <= 2 && (best === null || distance < best.distance)) best = {distance, kind}
  }
  return best ? SHOWN_AS.get(best.kind) : null
}

function editDistance(a, b) {
  const row = Array.from({length: b.length + 1}, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]
}

/** Words that are commands in the group WITHOUT a slash: the Latin marker of a recording. Everything else needs "/". */
const BARE_GROUP_WORDS = new Set(["prius"])

/**
 * A command in the group: like parseCommand, but STRICT - a group is a
 * conversation, so a sentence that merely starts with "Занятие", "Расписание",
 * "Спиноза" or "Class" is talk, not a command. Only a leading slash (or one of
 * BARE_GROUP_WORDS as the first word) makes a command; "/spinoza <subcommand> ..."
 * resolves to the class command. `words` is how many words the command took on
 * the first line (1 or 2) - the rest of a post is its text.
 * @returns {{kind: string, argument: string, words: number}}
 */
export function parseGroupCommand(text) {
  const trimmed = (text ?? "").trim()
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? ""
  if (!trimmed.startsWith("/") && !BARE_GROUP_WORDS.has(first)) return {kind: CommandKind.UNKNOWN, argument: "", words: 1}
  const command = parseCommand(text)
  if (command.kind !== CommandKind.SPINOZA) return {...command, words: 1}
  const [sub = "", ...rest] = command.argument.split(/\s+/)
  const kind = SPINOZA_SUBCOMMANDS.get(sub.toLowerCase())
  return kind ? {kind, argument: rest.join(" ").trim(), words: 2} : {...command, words: 1}
}
