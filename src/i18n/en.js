import {formatSize} from "../util/format.js"
import {formatDate} from "../domain/Session.js"
import {POLL_REACTIONS} from "../domain/Poll.js"
import {fitLines, shortFileName} from "./layout.js"

/**
 * English texts - the template: every language file has the same keys. The bot receives one of them as `replies`.
 * Commands in the help are written as typed - no quotes: /get 3, /move 15.09 18:30;
 * <parameter> is required, [parameter] optional, alternatives are separated by |.
 * Reports (list, storage, schedule) open with a HEADING and show no zeros:
 * "nothing yet" instead of "0 files", "Deleted folder empty" instead of "0 B".
 */
/** "1 file", "2 files" */
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const ROMAN = ["I", "II", "III", "IV", "V"]
/** plural labels of the Ethics entry types (the corpus is Russian) for the structure summary */
const ETHICS_TYPES = {
  определение: "Definitions",
  аксиома: "Axioms",
  "аксиома (о телах)": "Axioms on bodies",
  постулат: "Postulates",
  лемма: "Lemmas",
  теорема: "Theorems",
  доказательство: "Proofs",
  королларий: "Corollaries",
  схолия: "Scholia",
  объяснение: "Explanations",
  "определение аффекта": "Definitions of affects",
  "общее определение аффектов": "General definition of affects",
  предисловие: "Preface",
  прибавление: "Appendix",
  "прибавление (глава)": "Appendix chapters",
  примечание: "Notes",
}

export const en = {
  language: "en",
  /** "9.9 GiB" */
  sizeText: (bytes) => formatSize(bytes),
  // the apps' command menu - the closest thing to buttons: the frequent next actions
  botCommandsSpec: `'Help':/?,'Files':/files,'Get a file':/'get <number|name>','Next class':/class,'Classes':/'class list','Schedule':/'class schedule','Polls':/vote,'Spinoza, Ethics':/'ethics <ID>','Search the Ethics':/'ethics search <text>','Notifications':/watch,'All commands':/??`,

  /** The greeting when the bot joins a group: a quotation and what is done in the group. @param {{latin, ref}|null} citation */
  groupGreetingText(citation) {
    return [
      ...(citation ? [citation.latin, `[${citation.ref}]`, ""] : []),
      ...this.groupFileLines(),
      "prius [date] - tie a file to the last class",
      "",
      "/spinoza - open a private chat or get the help",
      "/spinoza schedule - show the schedule",
      "/spinoza class [date] [topic] - tie a post to a class",
    ].join("\n")
  },
  spinozaLinkText: (link) => `One-time link for a private chat:\n${link}`,
  /** What the group does with files - the same lines in the group greeting, the private greeting and every help. */
  groupFileLines() {
    return ["every file in the group is kept in the archive", `${this.triggerWord} - as a reply to a file or right after it: I post the file in the group and send it to you privately`]
  },
  /** The first message of a private chat the bot opens to send a requested file. */
  fileComingText: (name) => `You asked for ${shortFileName(name)} - it comes here as soon as you accept this chat.`,
  /** A requested file left the archive (deleted, or never downloaded) - said privately. */
  fileNotKeptText: (name) => `${shortFileName(name)} is no longer kept. The saved files: /files`,
  /** The caption of a file the bot re-posts in the group for the trigger word: the requester also gets it privately. */
  fileInGroupText: (name) => `${name}, the file is also in your private chat with me.`,
  /** The fetch word with no file near it - said privately. */
  whichFileText() {
    return `Which file? Write ${this.triggerWord} as a reply to the file, or right after it was posted.`
  },
  /** A quotation before a text: every help starts with a thought of Spinoza's. */
  withQuotationText: (citation, text) => (citation ? `${citation.latin}\n[${citation.ref}]\n\n${text}` : text),
  spinozaHelpSentText: () => "The help was sent to you privately.",
  spinozaChatOpenedText: () => "I sent you a request for a private chat - accept it in your chat list, the help arrives there.",
  spinozaPendingText: () => "The request for a private chat is already sent - accept it in your chat list.",
  introText: () => "I keep the group's files, organise the classes and help with Spinoza's Ethics.",
  /** The sections of the private chat - ONE block for the greeting, /? and /spinoza (rule: the three texts never drift apart). */
  sectionLines: () => [
    "/files - the saved files",
    "/class - the next class, the schedule, moves",
    "/vote - polls",
    "/ethics - Spinoza's Ethics",
    "/watch - notifications about classes",
  ],
  lettersText: () => "Commands shorten to one letter: /f, /c, /v, /e, /w.",
  /** The personal help for /spinoza (from the group or privately): what is done privately and what in the group. */
  spinozaHelpText(citation) {
    return [
      ...(citation ? [citation.latin, `[${citation.ref}]`, ""] : []),
      this.introText(),
      "",
      "In this private chat:",
      ...this.sectionLines(),
      "/? - the main commands, /?? - every command",
      this.lettersText(),
      "",
      "In the group:",
      ...this.groupFileLines(),
      "prius [date] - tie a file to the last class, or to the class on that date",
      "/spinoza schedule - show the schedule",
      "/spinoza class [date] [topic] - tie a post to a class",
      "/spinoza - this help into the private chat",
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
        "Files and classes are for members of the group I serve. What you can do here:",
        "/ethics <ID> - a passage of the Ethics. Example: /ethics E1p7",
        "/ethics search <text> - find text in the Ethics",
        "/? - this help",
      ].join("\n")
    }
    if (!full) return [this.introText(), "", ...this.sectionLines(), "", this.lettersText(), "Every command: /??"].join("\n")
    // every operation of every section, one line each (the section help adds the details)
    const lines = [
      "FILES",
      "/files [pattern] - show the files",
      "/get <number|name> - receive a file",
      "/delete <number|name> - move to the deleted folder",
      "/deleted - show the deleted files",
      "/restore <number|name> - bring a file back",
      "/space - storage usage",
      "/files ? - details",
      "",
      "CLASSES",
      "/class [date] - one class and its materials",
      "/class list [month|year|archive] - the lists and the archive of classes",
      "/class schedule [weekday] [time] - show or change the schedule",
      "/class move <date> [time] - move one class",
      "/class cancel [date] - cancel one class",
      "/watch [on|off] - notifications about changes",
      "/class ? - details",
      "",
      "POLLS",
      "/vote - active polls",
      "/vote <question> | <option 1> | <option 2> - create one",
      "/vote <number> - state and results",
      "/vote close <number> - end a poll",
      "/vote cancel <number> - cancel",
      "/vote history - closed polls",
      "/vote ? - details",
      "",
      "ETHICS",
      "/ethics - the memo",
      "/ethics [full|all] <ID> - a passage: E1p7, часть 1 теорема 7",
      "/ethics search <text> - find",
      "/ethics list <part> - the structure of a part",
      "/ethics random - a random theorem",
      "/ethics ? - identifiers and modes",
      "",
      "IN THE GROUP",
      ...this.groupFileLines(),
      "prius [date] - tie a file to the last class, or to the class on that date (used like conatus)",
      "/spinoza class [date] [topic] - tie a post to a class: as the first line of the post, a reply or a comment",
      "/spinoza schedule - show the schedule; /spinoza - the help into the private chat",
      "",
      "OTHER",
      "/status - the bot's state",
      "/confirm, /drop - accept or discard a previewed change",
      "",
      "SHORT FORMS",
      "One letter for the section, the English word for the operation:",
      "/f = /files",
      "/f delete 2 = /files delete 2",
      "/c 19.09 = /class 19.09",
      "/c move 20:00 = /class move 20:00",
      "/v close 1 = /vote close 1",
      "/e full E1p7 = /ethics full E1p7",
      "/w on = /watch on",
      "The Russian forms /ф /з /г /э /у and /д /п /о work too",
      "",
      "HELP",
      "/? - the main commands",
      "/?? - every command (this help)",
      "/<section> ? - a section's help: /f ?, /c ?, /v ?, /e ?",
    ]
    // /invite and /join are intentionally NOT listed here (admins learn them from the README) - do not add them back.
    if (isAdmin) lines.push("", "ADMIN", "/admins - the admins", "/unadmin <name> - remove an admin")
    return lines.join("\n")
  },
  /** The greeting of a new private contact. @param {{latin, ref}|null} citation */
  greetingText(citation, isMember = true) {
    return this.withQuotationText(citation, this.helpText(false, isMember, false)) // the greeting IS the short help
  },
  /** A list line: the name (long ones shortened), size, date; an empty file is flagged instead of dated. */
  fileLineText(number, f) {
    const name = shortFileName(f.name)
    if (f.size === 0) return `${number}. ${name} · 0 B · empty or not fully downloaded`
    return `${number}. ${name} · ${this.sizeText(f.size)} · ${this.dateText(f.modifiedAt.toISOString().slice(0, 10))}`
  },
  listText(files, pattern, maxChars) {
    if (files.length === 0) return pattern ? `No saved files match "${pattern}".\n\nList: /files` : "No files saved yet."
    const head = `FILES · ${files.length}${pattern ? ` · pattern ${pattern}` : ""} · newest first`
    const {lines, shown} = fitLines(files, maxChars - 100, (f, n) => this.fileLineText(n, f), head.length)
    const more = shown < files.length ? [`… and ${files.length - shown} more - narrow down: /files <pattern>`] : []
    return [head, "", ...lines, ...more, "", "Receive: /get <number>", "Filter: /files <pattern>", "Help: /files ?"].join("\n")
  },
  notFoundText: (query) => `There is no file "${query}".\n\nList: /files`,
  unknownCommandText: (word, suggestion) => [`I do not know the command "${word}".`, "", ...(suggestion ? ["Perhaps you meant:", suggestion, ""] : []), "Help: /?", "All commands: /??"].join("\n"),
  /** Too many files for one answer: a numbered choice. @param {string[]} names */
  tooManyText(query, names, maxChars) {
    const head = `FOUND · ${names.length} · ${query}`
    const {lines, shown} = fitLines(names, maxChars - 80, (name, n) => `${n}. ${shortFileName(name)}`, head.length)
    const more = shown < names.length ? [`… and ${names.length - shown} more`] : []
    return [head, "", ...lines, ...more, "", "Receive: /get <number>", "Narrow down: /get <name>"].join("\n")
  },
  getUsageText: () => "Give the file's number or name.\n\nExample: /get 3\nList: /files",
  noSuchNumberText: (number, count) => (count === 0 ? "No list has been shown yet.\n\nList: /files" : `There is no number ${number} in the list - it has ${count}.\n\nList: /files`),
  sendFailedText: (name) => `Sorry, I could not send ${name}.`,
  deniedText: () => "Sorry, only members of the group I serve can do that.\n\nWhat you can do: /?",

  promotionText(outcome, name) {
    switch (outcome) {
      case "granted":
        return `Welcome, ${name} - you are an admin now. Send /?? to see the admin commands.`
      case "already":
        return "You are already an admin."
      case "disabled":
        return "Admin access is not configured on this bot."
      default:
        return "Wrong secret."
    }
  },
  adminsOnlyText: () => "Sorry, this command is for admins only.",
  adminsListText: (admins) => (admins.length === 0 ? "No admins yet." : ["ADMINS", "", ...admins.map((a) => `${a.name} · since ${formatDate(a.since.slice(0, 10))}`), "", "Remove: /unadmin <name>"].join("\n")),
  deleteUsageText: () => "Give the file's number or exact name, one at a time.\n\nExample: /delete 3\nList: /files",
  /** @param {{classDate?: string|null, number?: number}} [o] classDate - the class card the file left; number - its number in the deleted folder now */
  deletedText(name, storedAs, {classDate = null, number = 1} = {}) {
    const head = `Moved "${shortFileName(name)}" to the deleted folder${storedAs !== name ? ` as "${shortFileName(storedAs)}"` : ""}.`
    return [head, ...(classDate ? [`Removed from the class of ${this.dateText(classDate)}.`] : []), "", `Bring back: /restore ${number}`, "Deleted folder: /deleted"].join("\n")
  },
  /** @param {"delete"|"restore"} action */
  ambiguousNameText(query, candidates, total, action = "delete") {
    const command = action === "delete" ? "/delete" : "/restore"
    const head = `FOUND · ${total} · ${query}`
    const rows = candidates.map((c, i) => `${i + 1}. ${shortFileName(c)}`)
    const more = total > candidates.length ? [`… and ${total - candidates.length} more`] : []
    const verb = action === "delete" ? "Delete" : "Bring back"
    return [head, "", ...rows, ...more, "", total === 1 ? `${verb}: ${command} 1` : `${verb} one at a time: ${command} <number>`].join("\n")
  },
  restoreUsageText: () => "Give the file's number or exact name.\n\nExample: /restore 3\nList: /deleted",
  restoredText(name, storedAs, {classDate = null} = {}) {
    const head = `Restored "${shortFileName(name)}" to the archive${storedAs !== name ? ` as "${shortFileName(storedAs)}"` : ""}.`
    return [head, ...(classDate ? [`Back on the class of ${this.dateText(classDate)}.`] : []), "", "List: /files"].join("\n")
  },
  deletedNotFoundText: (query) => `There is no deleted file "${query}".\n\nDeleted folder: /deleted`,
  deletedListText(files, maxChars) {
    if (files.length === 0) return "The deleted folder is empty."
    const head = `DELETED · ${files.length} · newest first`
    const {lines, shown} = fitLines(files, maxChars - 100, (f, n) => this.fileLineText(n, f), head.length)
    const more = shown < files.length ? [`… and ${files.length - shown} more`] : []
    return [head, "", ...lines, ...more, "", "Bring back: /restore <number>", "Help: /files ?"].join("\n")
  },
  /** @param {{used, reserved, limit, free, diskFree}} usage @param {{count, bytes, retentionMs}} deleted */
  spaceText(usage, deleted) {
    const lines = ["STORAGE", "", `Archive: ${this.sizeText(usage.used)} of ${this.sizeText(usage.limit)}`, `Free in the archive: ${this.sizeText(usage.free)}`]
    if (usage.reserved > 0) lines.push(`Downloading now: ${this.sizeText(usage.reserved)}`)
    lines.push("", deleted.count > 0 ? `Deleted folder: ${this.sizeText(deleted.bytes)} · ${plural(deleted.count, "file")}` : "Deleted folder empty")
    if (deleted.retentionMs > 0) lines.push(`Kept for: ${plural(Math.round(deleted.retentionMs / 86_400_000), "day")}`)
    if (usage.diskFree !== null) lines.push("", `Free disk space: ${this.sizeText(usage.diskFree)}`)
    lines.push("", "Deleted folder: /deleted", "Help: /files ?")
    return lines.join("\n")
  },
  statusText(s) {
    const hours = Math.floor(s.uptimeMs / 3_600_000)
    const minutes = Math.floor((s.uptimeMs % 3_600_000) / 60_000)
    return [
      "STATUS",
      "",
      `${s.name} ${s.version} · up ${hours}h ${minutes}m`,
      `Groups: ${s.groups.length > 0 ? s.groups.map((g) => g.title).join(", ") : "none yet"}`,
      s.fileCount > 0 ? `Archive: ${plural(s.fileCount, "file")} · ${this.sizeText(s.usage.used)} of ${this.sizeText(s.usage.limit)}${s.usage.reserved > 0 ? ` · downloading ${this.sizeText(s.usage.reserved)}` : ""}` : `Archive empty · limit ${this.sizeText(s.usage.limit)}`,
      s.deleted.count > 0 ? `Deleted folder: ${plural(s.deleted.count, "file")} · ${this.sizeText(s.deleted.bytes)}` : "Deleted folder empty",
      s.classCount > 0 ? `Classes: ${s.classCount}` : "No classes yet",
      s.schedule ? `Schedule: ${this.everyText(s.schedule, false)}` : "No schedule",
      ...(s.unknownCommands?.length > 0 ? [`Unknown commands: ${s.unknownCommands.map((u) => `${u.word} ×${u.count}`).join(", ")}`] : []),
      "",
      "Storage: /space",
    ].join("\n")
  },
  /** @param {number} minutes the window of the limit */
  slowDownText: (minutes = 1) => `Too many messages - please wait ${minutes === 1 ? "a minute" : plural(minutes, "minute")}.`,
  adminLockedText: () => "Too many wrong secrets - I will ignore /admin from you for an hour.",
  unadminUsageText: () => "Whom to remove?\n\nExample: /unadmin sam\nList: /admins",
  unadminDoneText: (name) => `${name} is no longer an admin.\nGroup owners and admins keep their rights through their group role.`,
  unadminNotFoundText: (name) => `There is no admin "${name}".\n\nList: /admins`,
  inviteText: (link) => `One-time invitation for a private chat with me (valid for one person):\n${link}`,
  joinUsageText: () => "Which group?\n\nExample: /join <group link> (the link from the group's settings)",
  joiningText(result, groupPattern, matches) {
    const name = result.title ? `the group "${result.title}"` : "the group"
    switch (result.status) {
      case "joined":
        return `I am already a member of ${name}.`
      case "own":
        return "That is my own link."
      case "notGroupLink":
        return "That is not a group link (it looks like a contact address or a one-time invitation)."
      default: {
        const head = `Connecting to ${name}… I join automatically once the group lets me in; you can follow it in my log.`
        return matches ? head : `${head}\nNote: the group does not match the configured group pattern "${groupPattern}", so I will not archive or serve its files.`
      }
    }
  },
  joinFailedText: (reason) => `Could not connect via that link: ${reason}`,

  /** "/ethics" without parameters - the practical memo. */
  ethicsHelpText: () => `SPINOZA, "ETHICS"

Read:
/ethics E1p7 - the passage and its proof
/ethics full E1p7 - add the scholia and corollaries
/ethics all E1p7 - also unfold the passages it refers to

Search:
/ethics search любовь

Browse the structure:
/ethics list 3
/ethics random

Short:
/e E1p7
/e full E1p7
/e all E1p7
/e search любовь
/e list 3
/e random

Help: /ethics ?`,
  /** "/ethics ?" - the reference of identifiers, modes and search. */
  ethicsGuideText: () => `IDENTIFIERS OF THE "ETHICS"

Э1т7       part I, theorem 7
Э1т7док    proof
Э1т6кор1   first corollary
Э1т8сх2    second scholium
Э1опр3     definition 3
Э1акс1     axiom 1
Э2пост4    postulate 4
Э2лем3     lemma 3
Э3афф1     definition of affect 1

Without "Э":
1т7

In Latin letters:
E1p7 or 1p7

MODES

/ethics <ID>
The passage and its proof.

/ethics full <ID>
Add the corollaries, scholia, explanations
and the notes belonging to the passage.

/ethics all <ID>
The full text, then the texts of every passage it refers to.

SEARCH

/ethics search <text>
/ethics search <text> part <1-5>
/ethics search <text> type <type>

Examples:
/ethics search любовь part 3
/ethics search свобода type схолия

SHORT FORMS

/e <ID>
/e full <ID> - full
/e all <ID> - all
/э п <text> - search (ч <part>, т <type>)
/э с <part> - list
/e random - random`,
  /** @param {{rid: string, meaning: string}[]} hints what the identifier may have meant */
  ethicsNotFoundText(ref, hints = []) {
    if (hints.length === 0) return `There is no passage "${ref}".\n\nHelp: /ethics ?`
    return [`There is no passage "${ref}".`, "", "Possible forms:", ...hints.map((h) => `${h.rid} - ${h.meaning}`), "", `Show the whole passage: /ethics full ${hints[0].rid}`].join("\n")
  },
  ethicsUnknownModeText: (word, ref) => `I do not know the mode "${word}".\n\nPerhaps you meant:\n/ethics full ${ref}\n/ethics all ${ref}`,
  /** @param {{part?: number|null, type?: string|null}} [filter] what the search was limited to */
  ethicsSearchText(query, results, max, {part = null, type = null} = {}) {
    const scope = `${part ? ` · part ${part}` : ""}${type ? ` · ${type}` : ""}`
    if (results.length === 0) return `Nothing found for "${query}"${scope}.\n\nHelp: /ethics ?`
    const shown = results.slice(0, max).map((e) => `${e.rid} (${e.type}): ${e.text.slice(0, 100)}…`)
    const more = results.length > max ? [`… and ${results.length - max} more`] : []
    const narrow = part === null ? [`Narrow down: /ethics search ${query} part <1-5>`] : []
    return [`SEARCH IN THE ETHICS · ${query}${scope} · ${results.length}`, "", ...shown, ...more, "", "Open: /ethics <ID>", ...narrow].join("\n")
  },
  /** "Theorems" - the plural label of an entry type in the structure summary */
  ethicsTypeLabel: (type) => ETHICS_TYPES[type] ?? type,
  /**
   * "/ethics list 3" - the structure of a part: how many entries of each type, not the entries themselves.
   * @param {Array<[string, number]>} counts type -> count in reading order
   */
  ethicsListText(part, counts) {
    if (part === null) return "Which part?\n\nExample: /ethics list 3"
    const total = counts.reduce((sum, [, n]) => sum + n, 0)
    return [`ETHICS · PART ${ROMAN[part - 1] ?? part} · ${plural(total, "entry", "entries")}`, "", ...counts.map(([type, n]) => `${this.ethicsTypeLabel(type)} · ${n}`), "", `List them: /ethics list ${part} теоремы`, "Open: /ethics <ID>"].join("\n")
  },
  /** "/ethics list 3 теоремы" - the entries of one type with the start of their text. */
  ethicsTypeListText(part, type, entries) {
    if (entries.length === 0) return `Part ${ROMAN[part - 1] ?? part} has no entries of type "${type}".\n\nStructure: /ethics list ${part}`
    return [`ETHICS · PART ${ROMAN[part - 1] ?? part} · ${this.ethicsTypeLabel(entries[0].type).toUpperCase()} · ${entries.length}`, "", ...entries.map((e) => `${e.rid} - ${e.text.length > 70 ? `${e.text.slice(0, 70)}…` : e.text}`), "", "Open: /ethics <ID>"].join("\n")
  },
  ethicsContinuedText: (i, n) => `(part ${i} of ${n})`,
  ethicsTruncatedText: (n) => `… the rest is left out (more than ${n} messages). Ask for smaller pieces, e.g. /ethics full <ID>.`,

  // ---- classes ("занятия") ----
  weekdayName: (i) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i],
  dateText: (ymd) => formatDate(ymd),
  /** The technical form for the log: "Tuesday 19:00 (UTC)". */
  scheduleText(schedule) {
    return `${this.weekdayName(schedule.weekday)} ${schedule.time} (${schedule.timezone})`
  },
  /** "Every Tuesday at 19:00" / "every Tuesday at 19:00" */
  everyText(schedule, capital = true) {
    return `${capital ? "Every" : "every"} ${this.weekdayName(schedule.weekday)} at ${schedule.time}`
  },
  moveUsageText: () => "Move it where?\n\nExample: /class move 23.09 20:00\nTime only: /class move 20:00",
  cancelUsageText: () => "Which class?\n\n/class cancel - the next one\n/class cancel 23.09 - the one on that date",
  noNextClassText: () => "No upcoming class found.\n\nSchedule: /class schedule",
  /** "19.09.2026, 12:15" - a class's date and time in sentences and cards */
  whenText(date, time) {
    return `${this.dateText(date)}${time ? `, ${time}` : ""}`
  },
  moveNoChangeText(date, time) {
    return `The class of ${this.dateText(date)} is already at ${time}.`
  },
  /** The confirmation lines - the same under every preview. */
  confirmLinesText: (apply = false) => [`${apply ? "Apply" : "Confirm"}: /confirm`, "Drop: /drop"],
  /** The preview of a move: a concrete date even when only a time was given. */
  movePreviewText(from, fromTime, to, time, itemCount) {
    const head = [from === to ? `Move the class of ${this.dateText(from)} from ${fromTime} to ${time}?` : `Move the class of ${this.whenText(from, fromTime)} to ${this.whenText(to, time)}?`]
    const consequence = from !== to && itemCount > 0 ? ["Its homework and files move along.", ""] : []
    return [...head, "", ...consequence, ...this.confirmLinesText()].join("\n")
  },
  classMovedText(from, to, time) {
    return from === to ? `Class ${this.dateText(to)} now starts at ${time}.` : `Class ${this.dateText(from)} moved to ${this.whenText(to, time)}. Its homework and files moved along.`
  },
  /** Before a cancellation: the consequences and the request to confirm. */
  cancelConfirmText(date, time, following, followingTime, itemCount) {
    return [
      `Cancel the class of ${this.whenText(date, time)}?`,
      "",
      itemCount > 0 ? `Its homework and files will move to the class of ${this.whenText(following, followingTime)}.` : `Nothing is posted for it yet; the following class is ${this.whenText(following, followingTime)}.`,
      "",
      ...this.confirmLinesText(),
    ].join("\n")
  },
  /** the actions that show a preview - the same list under both "nothing to …" answers */
  previewersText: () => "Previews come from: /class schedule, /class move, /class cancel, /vote",
  nothingToConfirmText() {
    return `Nothing to confirm.\n\n${this.previewersText()}`
  },
  nothingToDropText() {
    return `Nothing to drop.\n\n${this.previewersText()}`
  },
  confirmationDroppedText: () => "Dropped, nothing changed.",
  classCancelledText(date, to) {
    return `Class ${this.dateText(date)} is cancelled. Its homework and files moved to ${this.dateText(to)}.`
  },
  /** The private echo of a group announcement: what was said and where. @param {string[]} groupNames */
  announcedText: (text, groupNames) => `${text} Announced in the ${groupNames.length === 1 ? "group" : "groups"} ${groupNames.map((n) => `"${n}"`).join(", ")}.`,
  classAlreadyCancelledText(date) {
    return `Class ${this.dateText(date)} is already cancelled or moved.`
  },
  reminderText: (minutes, topic = null) => `The class starts in ${plural(minutes, "minute")}${topic ? `: ${topic}` : ""}.`,
  /** "Stays as it is: 19.09.2026, 12:15" - classes with materials keep their date and time under a new rule. @param {Array<{date, time}>} pinned */
  pinnedLinesText(pinned) {
    return pinned.length > 0 ? [pinned.length === 1 ? "Stays as it is:" : "Stay as they are:", ...pinned.map((p) => this.whenText(p.date, p.time)), ""] : []
  },
  /** The preview of a new schedule. @param {{date, time}|null} next @param {Array<{date, time}>} [pinned] */
  schedulePreviewText(schedule, next, pinned = []) {
    return ["NEW SCHEDULE", "", this.everyText(schedule), `Time zone: ${schedule.timezone}`, "", ...(next ? ["Next class:", this.whenText(next.date, next.time), ""] : []), ...this.pinnedLinesText(pinned), ...this.confirmLinesText(true)].join("\n")
  },
  scheduleSetText(schedule, next, pinned = []) {
    return [`Schedule changed: ${this.everyText(schedule, false)}.`, ...(next ? [`Next class: ${this.whenText(next.date, next.time)}.`] : []), ...pinned.map((p) => `The class of ${this.whenText(p.date, p.time)} stays as it is.`), "Past classes, moves, cancellations and materials are kept."].join("\n")
  },
  /** @param {{next: {date, time, movedFrom}|null, changes: Array<{kind, date, to?, time?}>}|null} outlook */
  scheduleShowText(schedule, outlook = null) {
    if (!schedule) return "No regular schedule yet.\n\nSet it: /class schedule <weekday> <hh:mm>\nExample: /class schedule tue 19:00"
    const lines = ["SCHEDULE", "", this.everyText(schedule), `Time zone: ${schedule.timezone}`]
    if (outlook?.next) lines.push("", "Next class:", `${this.whenText(outlook.next.date, outlook.next.time)}${outlook.next.movedFrom ? ` (moved from ${this.dateText(outlook.next.movedFrom)})` : ""}`)
    if (outlook?.changes.length > 0) {
      lines.push("", "Exceptions:")
      for (const c of outlook.changes) {
        if (c.kind === "moved") lines.push(`${this.dateText(c.date)} · moved to ${this.whenText(c.to, c.time)}`)
        else if (c.kind === "cancelled") lines.push(`${this.dateText(c.date)} · cancelled`)
        else lines.push(`${this.dateText(c.date)} · starts at ${c.time}`)
      }
    }
    lines.push("", "Help: /class ?")
    return lines.join("\n")
  },
  scheduleUsageText: () => "Usage: /class schedule <weekday> <hh:mm>\nExample: /class schedule tue 19:00",
  /** "September" */
  monthName: (m) => MONTHS[m - 1],
  /** "05.09" */
  shortDateText: (ymd) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`,
  /** "16.09.2026" - the day of an instant in the bot's time zone */
  dayOfText(iso, timezone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric"}).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
    return `${p.day}.${p.month}.${p.year}`
  },
  postTiedText(date, time) {
    return `Post tied to the class of ${this.whenText(date, time)}.`
  },
  /** The short schedule for the group. @param {{date, time}|null} next @param {boolean} changeAsked someone tried to change it from the group */
  scheduleBriefText(schedule, next, changeAsked = false) {
    if (!schedule) return "No regular schedule yet."
    const lines = ["SCHEDULE", "", this.everyText(schedule), ...(next ? [`Next class: ${this.whenText(next.date, next.time)}`] : [])]
    if (changeAsked) lines.push("", "Change it: in the private chat, /class schedule")
    return lines.join("\n")
  },
  /** A file is on its class card now - one line in the group (recordings and readings alike). */
  savedToClassText(date, name) {
    return `Saved to the class of ${this.dateText(date)}: ${shortFileName(name)}`
  },
  /** A private command typed in the group - one and the same line for any of them. */
  privateOnlyText: () => "This is done in the private chat: write to me or send /spinoza.",
  attachFailedText: (name) => `Could not add ${name} to the class: it is not in the archive and can no longer be downloaded. Please post the file again.`,
  /** A file a class command asked for was refused: the archive is full, or its name is not allowed. @param {"full"|"unsafe"} reason */
  attachRefusedText: (name, reason) => `Could not add ${shortFileName(name)} to the class: ${reason === "full" ? "the archive is full" : "a file name with a path or control characters is not allowed"}.`,
  recordingNeedsDateText: () => "Which class? Add the date: prius <date>.",
  /** prius with no file near it (in the group). */
  noFileText(word = "prius") {
    return `Which file? Write ${word} in the file's caption, as a reply to it, or right after it was posted.`
  },
  /** "1 post · 2 files · recording" or "nothing yet". @param {{posts, files}|null} session */
  materialsText(session) {
    if (!session) return "nothing yet"
    const readings = session.files.filter((f) => f.kind !== "audio").length
    const parts = [...(session.posts.length > 0 ? [plural(session.posts.length, "post")] : []), ...(readings > 0 ? [plural(readings, "file")] : []), ...(session.files.some((f) => f.kind === "audio") ? ["recording"] : [])]
    return parts.length > 0 ? parts.join(" · ") : "nothing yet"
  },
  classStatusText: (status) => ({next: "next", planned: "planned", past: "past", moved: "moved", cancelled: "cancelled"})[status],
  /**
   * The card of one class - only what is filled in (see domain/ClassCalendar.js classCard).
   * @param {{date, time, status, topic, posts, files, movedFrom, movedTo, schedule}} card
   * @param {{footer?: boolean}} [options] footer - the link to the list (not in the group)
   */
  classCardText(card, {footer = true} = {}) {
    const head = card.status === "next" ? "NEXT CLASS" : `CLASS · ${this.classStatusText(card.status)}`
    const lines = [head, "", this.whenText(card.date, card.time)]
    if (card.topic) lines.push(`Topic: ${card.topic}`)
    if (card.movedFrom) lines.push(`Moved from ${this.dateText(card.movedFrom)}`)
    if (card.status === "moved") lines.push(`Moved to ${this.dateText(card.movedTo)}`)
    if (card.status === "cancelled") lines.push(`Homework and files moved to ${this.dateText(card.movedTo)}`)
    for (const p of card.posts) if (p.text) lines.push("", `Homework (${p.author}${p.editedAt ? `, edited ${this.dateText(p.editedAt.slice(0, 10))}` : ""}):`, p.text)
    const readings = card.files.filter((f) => f.kind !== "audio")
    const audio = card.files.filter((f) => f.kind === "audio")
    let n = 0 // the numbers continue across the two blocks: /д <number> refers to them (see Syllabus)
    if (readings.length > 0) lines.push("", "Files:", ...readings.map((f) => `${++n}. ${shortFileName(f.name)}`))
    if (audio.length > 0) lines.push("", "Recording:", ...audio.map((f) => `${++n}. ${shortFileName(f.name)}`))
    if (card.posts.every((p) => !p.text) && card.files.length === 0 && card.status !== "cancelled" && card.status !== "moved") lines.push("", "Nothing posted yet.")
    if (card.schedule) lines.push("", `Schedule: ${this.everyText(card.schedule, false)}`)
    if (footer) lines.push("", ...(card.files.length > 0 ? ["Receive: /д <number>"] : []), "All classes: /class list", "Help: /class ?")
    return lines.join("\n")
  },
  noSessionsText: () => "No classes yet.\n\nSchedule: /class schedule <weekday> <hh:mm>\nIn the group: /spinoza class - mark a class post",
  sessionNotFoundText: (what) => `There is no class "${what}".\n\nList: /class list`,
  /** A list line: date, time (for future ones), topic, materials; moved and cancelled markers. @param {{date, time, status, session}} c */
  classLineText(c, {withTime = c.status === "next" || c.status === "planned", withStatus = false} = {}) {
    if (c.status === "cancelled") return `${this.shortDateText(c.date)} · cancelled`
    if (c.status === "moved") return `${this.shortDateText(c.date)} · moved to ${this.shortDateText(c.session.movedTo)}`
    const parts = [this.shortDateText(c.date) + (withTime && c.time ? `, ${c.time}` : "")]
    if (withStatus) parts.push(this.classStatusText(c.status))
    if (c.session?.topic) parts.push(c.session.topic)
    parts.push(this.materialsText(c.session))
    return parts.join(" · ")
  },
  /** "/classes": a few upcoming and recent classes. @param {{upcoming, recent, year, month}} o */
  classesOverviewText({upcoming, recent, year, month}) {
    const lines = ["CLASSES"]
    if (upcoming.length > 0) lines.push("", "Upcoming:", ...upcoming.map((c) => this.classLineText(c, {withTime: true})))
    if (recent.length > 0) lines.push("", "Recent:", ...recent.map((c) => this.classLineText(c, {withTime: false})))
    if (upcoming.length === 0 && recent.length === 0) lines.push("", "No classes yet.")
    lines.push("", `Month: /class list ${String(month).padStart(2, "0")}.${year}`, "Archive: /class list archive", "Help: /class ?")
    return lines.join("\n")
  },
  /** "/classes 09.2026": every class of the month. @param {{year, month, items}} o */
  classesMonthText({year, month, items}) {
    const prev = month === 1 ? `12.${year - 1}` : `${String(month - 1).padStart(2, "0")}.${year}`
    const next = month === 12 ? `01.${year + 1}` : `${String(month + 1).padStart(2, "0")}.${year}`
    const body = items.length > 0 ? items.map((c) => this.classLineText(c, {withStatus: true})) : ["No classes in this month."]
    return [`CLASSES · ${this.monthName(month).toUpperCase()} ${year}`, "", ...body, "", `Previous: /class list ${prev}`, `Next: /class list ${next}`].join("\n")
  },
  /** "/classes 2026": the months of a year with their counts. @param {Map<number, number>} counts */
  classesYearText(year, counts) {
    const body = counts.size > 0 ? [...counts].map(([m, n]) => `${this.monthName(m)} · ${plural(n, "class", "classes")}`) : ["No classes in this year."]
    const last = [...counts.keys()].at(-1)
    return [`CLASSES · ${year}`, "", ...body, "", `Open a month: /class list ${last ? `${String(last).padStart(2, "0")}.${year}` : "<mm.yyyy>"}`].join("\n")
  },
  /** "/classes archive": the years with their counts. @param {Map<number, number>} counts latest first */
  classesArchiveText(counts) {
    const body = counts.size > 0 ? [...counts].map(([y, n]) => `${y} · ${plural(n, "class", "classes")}`) : ["No classes yet."]
    const years = [...counts.keys()]
    return ["CLASS ARCHIVE", "", ...body, "", `Open a year: /class list ${years.length > 1 ? years[1] : (years[0] ?? "<year>")}`].join("\n")
  },
  classesUsageText: (argument = null) => `Which period?\n\n/class list - upcoming and recent\n/class list 09.2026 - a month\n/class list 2026 - a year\n/class list archive - every year\nOne class: /class ${argument ?? "<date>"}`,
  /** "/class ?": the whole section. */
  classHelpText: () => [
    "CLASSES",
    "",
    "/class [date]",
    "The next class, or the one on that date.",
    "Short: /з [date]",
    "",
    "/class list [month|year|archive]",
    "The list and the archive of classes.",
    "Short: /з с",
    "",
    "/class schedule [weekday] [time]",
    "Show or change the weekly schedule.",
    "Short: /з р",
    "",
    "/class move <date> [time]",
    "Move one class.",
    "Short: /з п",
    "",
    "/class cancel [date]",
    "Cancel one class.",
    "Short: /з о",
    "",
    "Changes apply after /confirm (/п); /drop (/о) discards them.",
    "Dates: 19.09, 19 сентября, 2026-09-19, today, tomorrow, friday.",
    "A class's files are fetched by their number on the card: /д <number>.",
    "Homework and posts are edited and deleted in the group, the card follows; a file is removed with /ф у <number>.",
  ].join("\n"),
  /** "/files ?": the whole section. */
  filesHelpText: () => [
    "FILES",
    "",
    "/files [pattern]",
    "The saved files, newest first; a pattern like *.pdf narrows the list.",
    "Also: /list, /ф",
    "",
    "/get <number|name>",
    "Receive a file by its number in the list or by name.",
    "Also: /д, /files get, /ф д",
    "",
    "/delete <number|name>",
    "Move a file to the deleted folder (one at a time).",
    "Also: /files delete, /ф у",
    "",
    "/deleted",
    "The deleted files; kept for a limited time.",
    "Also: /files deleted, /ф к",
    "",
    "/restore <number|name>",
    "Bring a file back from the deleted folder.",
    "Also: /files restore, /ф в",
    "",
    "/space",
    "Used and free space.",
    "Also: /files space, /ф м",
    "",
    "Numbers refer to the list shown last.",
  ].join("\n"),
  watchUsageText: () => "Send /watch on or /watch off; without a word I tell you whether they are on.",
  watchStatusText: (on) => (on ? "Notifications about classes are on: I write to you privately when the homework changes, a file is added or a recording is posted.\n\nTurn off: /watch off" : "Notifications about classes are off.\n\nTurn on: /watch on"),
  sessionChangedText(date, changes) {
    const parts = []
    if (changes.some((c) => c.kind === "post")) parts.push(`new post (${uniqueNames(changes, "post")})`)
    if (changes.some((c) => c.kind === "edit")) parts.push(`homework edited (${uniqueNames(changes, "edit")})`)
    const files = changes.filter((c) => c.kind === "file")
    if (files.length > 0) parts.push(`file(s) added: ${files.map((c) => shortFileName(c.name)).join(", ")}`)
    if (changes.some((c) => c.kind === "audio")) parts.push("recording posted")
    for (const c of changes.filter((c) => c.kind === "moved")) parts.push(`moved here from ${this.dateText(c.from)} (${c.by})`)
    for (const c of changes.filter((c) => c.kind === "cancelled")) parts.push(`class ${this.dateText(c.from)} cancelled, its materials are here now (${c.by})`)
    return `Class ${this.dateText(date)}: ${parts.join("; ")}.\n\nDetails: /class ${this.shortDateText(date)}`
  },

  // ---- polls ----
  /** "16.09.2026, 18:00" in the bot's time zone */
  instantText(iso, timezone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
    return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}`
  },
  /** "/vote ?": the whole section. */
  pollHelpText: () => [
    "POLLS",
    "",
    "/vote",
    "My active polls.",
    "Short: /г",
    "",
    "/vote <question> | <option 1> | <option 2> [| …]",
    `Create a poll (up to ${POLL_REACTIONS.length} options). A preview is shown; after /confirm it is published as one message in the group and members vote with reactions.`,
    "Parameters: --days <n> (duration; without it a poll closes after 8 days without a vote), --multiple (several options may be chosen), --group <name> (when there are several groups)",
    "",
    "/vote <number>",
    "State and results.",
    "Short: /г <number>",
    "",
    "/vote close <number>",
    "End a poll (author or admin).",
    "Short: /г з <number>",
    "",
    "/vote cancel <number>",
    "Cancel a published poll - with a confirmation.",
    "Short: /г о <number>",
    "",
    "/vote history",
    "Closed and cancelled polls.",
    "Short: /г и",
    "",
    "Example: /г When shall we meet? | Monday 18:30 | Tuesday 18:30 --days 3",
  ].join("\n"),
  pollNoActiveText: () => "No active polls.\n\nCreate one: /vote <question> | <option 1> | <option 2>\nExample: /vote When shall we meet? | Monday 18:30 | Tuesday 18:30\nHelp: /vote ?",
  pollErrorText(code) {
    switch (code) {
      case "noSeparator":
        return "Could not separate the question from the options.\n\nUse the | character:\n/vote When shall we meet? | Monday | Tuesday"
      case "fewOptions":
        return "I need a question and at least two options, separated by | :\n/vote When shall we meet? | Monday | Tuesday"
      case "tooManyOptions":
        return `Too many options: there are reactions for ${POLL_REACTIONS.length}.`
      default:
        return "The duration is a whole number of days from 1 to 365: --days 3"
    }
  },
  pollLimitText: (max) => `You already have ${plural(max, "active poll")}.\n\nClose one: /vote close <number>`,
  pollNoGroupText: () => "I am not in any group yet, so there is nowhere to publish.",
  pollGroupAmbiguousText: (names) => `I serve several groups - say where to publish: --group <name>. Groups: ${names.join(", ")}.`,
  pollGroupUnknownText: (name, names) => `I have no group "${name}". Groups: ${names.join(", ")}.`,
  pollOptionsText(poll, counts = null, leaders = []) {
    const mark = leaders.length > 1 ? " · tied" : " · chosen"
    return poll.options.map((o, i) => `${POLL_REACTIONS[i]} ${o}${counts ? ` · ${counts[i]}${leaders.includes(i) ? mark : ""}` : ""}`).join("\n")
  },
  pollModeText: (poll) => (poll.multiple ? "several options" : "one option"),
  pollPreviewText(poll, timezone) {
    return [
      "NEW POLL",
      "",
      poll.question,
      "",
      this.pollOptionsText(poll),
      "",
      `Mode: ${this.pollModeText(poll)}`,
      `Duration: ${poll.days ? plural(poll.days, "day") : (poll.idleDays ? `no limit; closes after ${plural(poll.idleDays, "day")} without a vote` : "no limit")}`,
      `Group: ${poll.group.name}`,
      ...(poll.closesAt ? [`Closes: ${this.instantText(poll.closesAt, timezone)}`] : []),
      "",
      ...this.confirmLinesText(),
    ].join("\n")
  },
  /** The message in the group: the same one is edited after every vote and at the end. */
  pollPostText(poll, {counts, participants, leaders}, timezone) {
    const closed = poll.status === "closed" || poll.status === "cancelled"
    const head = `POLL #${poll.id}${poll.status === "closed" ? " · CLOSED" : poll.status === "cancelled" ? " · CANCELLED" : ""}`
    const lines = [head, "", poll.question, "", this.pollOptionsText(poll, participants > 0 || closed ? counts : null, poll.status === "closed" ? leaders : []), ""]
    if (!closed) lines.push(poll.multiple ? "Choose any number of options with reactions." : "Choose one option with a reaction.")
    if (participants > 0 || closed) lines.push(plural(participants, "vote"))
    const ending = closed ? `Ended: ${this.instantText(poll.closedAt ?? poll.closesAt, timezone)}${poll.closedBy === "idle" ? ` · ${plural(poll.idleDays, "day")} without a vote` : ""}` : poll.closesAt ? `Closes: ${this.instantText(poll.closesAt, timezone)}` : null
    if (ending) lines.push(ending) // a poll without a deadline says nothing about closing in the group: its author is told privately
    return lines.join("\n")
  },
  pollPublishedText: (poll) => `Poll #${poll.id} is published in the group "${poll.group.name}".${!poll.closesAt && poll.idleDays ? `\n\n${`No deadline: if nobody votes for ${plural(poll.idleDays, "day")}, the poll closes by itself.`}` : ""}\n\nOpen: /vote ${poll.id}\n${poll.closesAt ? "Close early" : "Close"}: /vote close ${poll.id}`,
  pollCancelConfirmText(poll) {
    return [`Cancel poll #${poll.id} "${poll.question}"?`, "", "The message in the group will be marked cancelled.", "", ...this.confirmLinesText()].join("\n")
  },
  pollCancelledText: (poll) => `Poll #${poll.id} is cancelled.`,
  pollNotFoundText: (id) => `There is no poll #${id}.\n\nList: /vote\nHistory: /vote history`,
  pollNotOpenText: (id) => `Poll #${id} is already closed or cancelled.`,
  pollNotYoursText: (id) => `Only its author or an admin may manage poll #${id}.`,
  pollShowText(poll, result, timezone) {
    return this.pollPostText(poll, result, timezone) + (poll.status === "open" ? `${!poll.closesAt && poll.idleDays ? `\n\n${`No deadline: if nobody votes for ${plural(poll.idleDays, "day")}, the poll closes by itself.`}` : ""}\n\n${poll.closesAt ? "Close early" : "Close"}: /vote close ${poll.id}` : "")
  },
  pollClosedText(poll, result, timezone) {
    return `Poll #${poll.id} is closed.\n\n${this.pollPostText(poll, result, timezone)}`
  },
  /** The active polls: number and question, below them the votes and the deadline. */
  pollListText(items, timezone) {
    const width = Math.max(...items.map(({poll}) => String(poll.id).length))
    const rows = items.flatMap(({poll, tally: r, closesOn}) => [`${String(poll.id).padEnd(width)}  ${poll.question}`, `${" ".repeat(width)}  ${plural(r.participants, "vote")} · ${poll.closesAt ? `until ${this.instantText(poll.closesAt, timezone)}` : closesOn ? `closes ${this.instantText(new Date(closesOn).toISOString(), timezone)} unless someone votes` : "no deadline"}`, ""])
    return ["ACTIVE POLLS", "", ...rows, `Open: /vote ${items.length === 1 ? items[0].poll.id : "<number>"}`, "Create: /vote <question> | <option 1> | <option 2>", "Help: /vote ?"].join("\n")
  },
  pollHistoryText(items, timezone) {
    if (items.length === 0) return "No closed polls yet.\n\nList: /vote"
    const width = Math.max(...items.map(({poll}) => String(poll.id).length))
    const rows = items.flatMap(({poll, tally: r}) => [`${String(poll.id).padEnd(width)}  ${poll.question}`, `${" ".repeat(width)}  ${poll.status === "cancelled" ? "cancelled" : plural(r.participants, "vote")} · ${this.dayOfText(poll.closedAt ?? poll.closesAt ?? poll.createdAt, timezone)}`, ""])
    return [`POLL HISTORY · ${items.length}`, "", ...rows, "Open: /vote <number>"].join("\n")
  },
}

function uniqueNames(changes, kind) {
  return [...new Set(changes.filter((c) => c.kind === kind).map((c) => c.by))].join(", ")
}

