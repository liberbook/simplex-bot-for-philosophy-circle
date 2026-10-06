import {formatSize} from "../util/format.js"
import {formatDate} from "../domain/Session.js"
import {POLL_REACTIONS} from "../domain/Poll.js"
import {fitLines, shortFileName} from "./layout.js"

/**
 * Italian texts. Same keys as en.js - a test compares the key sets, so a new
 * language is a copy of en.js with the values translated and nothing else.
 *
 * Commands stay as they are typed (/files, /class, /vote, /ethics and the Russian
 * forms): the bot parses the same words whatever language it answers in.
 */
/** "1 file", "2 file": many Italian nouns are invariable, so the plural defaults to the singular */
const plural = (n, one, many = one) => `${n} ${n === 1 ? one : many}`
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
const ROMAN = ["I", "II", "III", "IV", "V"]
/** plural labels of the Ethics entry types (the corpus is Russian) for the structure summary */
const ETHICS_TYPES = {
  определение: "Definizioni",
  аксиома: "Assiomi",
  "аксиома (о телах)": "Assiomi sui corpi",
  постулат: "Postulati",
  лемма: "Lemmi",
  теорема: "Proposizioni",
  доказательство: "Dimostrazioni",
  королларий: "Corollari",
  схолия: "Scolii",
  объяснение: "Spiegazioni",
  "определение аффекта": "Definizioni degli affetti",
  "общее определение аффектов": "Definizione generale degli affetti",
  предисловие: "Prefazione",
  прибавление: "Appendice",
  "прибавление (глава)": "Capitoli dell'appendice",
  примечание: "Note",
}

export const it = {
  language: "it",
  /** "9.9 GiB" */
  sizeText: (bytes) => formatSize(bytes).replace(".", ","),
  // the apps' command menu - the closest thing to buttons: the frequent next actions
  botCommandsSpec: `'Guida':/?,'File':/files,'Ricevi un file':/'get <numero|nome>','Prossima lezione':/class,'Lezioni':/'class list','Orario':/'class schedule','Sondaggi':/vote,'Spinoza, Etica':/'ethics <ID>','Cerca nel testo':/'ethics search <testo>','Notifiche':/watch,'Tutti i comandi':/??`,

  /** The greeting when the bot joins a group: a quotation and what is done in the group. @param {{latin, ref}|null} citation */
  groupGreetingText(citation) {
    return [
      ...(citation ? [citation.latin, `[${citation.ref}]`, ""] : []),
      ...this.groupFileLines(),
      "prius [data] - lega un file all'ultima lezione",
      "",
      "/spinoza - apri una chat privata o ricevi la guida",
      "/spinoza schedule - mostra l'orario",
      "/spinoza class [data] [tema] - lega un messaggio a una lezione",
    ].join("\n")
  },
  spinozaLinkText: (link) => `Link monouso per una chat privata:\n${link}`,
  /** What the group does with files - the same lines in the group greeting, the private greeting and every help. */
  groupFileLines() {
    return ["ogni file del gruppo resta nell'archivio", `${this.triggerWord} - in risposta a un file o subito dopo: ripubblico il file nel gruppo e te lo mando in privato`]
  },
  /** The first message of a private chat the bot opens to send a requested file. */
  fileComingText: (name) => `Hai chiesto ${shortFileName(name)} - arriva qui appena accetti questa chat.`,
  /** A requested file left the archive (deleted, or never downloaded) - said privately. */
  fileNotKeptText: (name) => `${shortFileName(name)} non è più conservato. I file salvati: /files`,
  /** The caption of a file the bot re-posts in the group for the trigger word: the requester also gets it privately. */
  fileInGroupText: (name) => `${name}, il file è anche nella tua chat privata con me.`,
  /** The fetch word with no file near it - said privately. */
  whichFileText() {
    return `Quale file? Scrivi ${this.triggerWord} in risposta al file o subito dopo che è stato pubblicato.`
  },
  /** A quotation before a text: every help starts with a thought of Spinoza's. */
  withQuotationText: (citation, text) => (citation ? `${citation.latin}\n[${citation.ref}]\n\n${text}` : text),
  spinozaHelpSentText: () => "La guida ti è stata inviata in privato.",
  spinozaChatOpenedText: () => "Ti ho mandato una richiesta di chat privata - accettala nella tua lista chat, la guida arriva lì.",
  spinozaPendingText: () => "La richiesta di chat privata è già stata mandata - accettala nella tua lista chat.",
  introText: () => "Conservo i file del gruppo, organizzo le lezioni e aiuto a leggere l'Etica di Spinoza.",
  /** The sections of the private chat - ONE block for the greeting, /? and /spinoza (rule: the three texts never drift apart). */
  sectionLines: () => [
    "/files - i file salvati",
    "/class - la prossima lezione, l'orario, gli spostamenti",
    "/vote - i sondaggi",
    "/ethics - l'Etica di Spinoza",
    "/watch - le notifiche sulle lezioni",
  ],
  lettersText: () => "I comandi si abbreviano con una lettera: /f, /c, /v, /e, /w.",
  /** The personal help for /spinoza (from the group or privately): what is done privately and what in the group. */
  spinozaHelpText(citation) {
    return [
      ...(citation ? [citation.latin, `[${citation.ref}]`, ""] : []),
      this.introText(),
      "",
      "In questa chat privata:",
      ...this.sectionLines(),
      "/? - i comandi principali, /?? - tutti i comandi",
      this.lettersText(),
      "",
      "Nel gruppo:",
      ...this.groupFileLines(),
      "prius [data] - lega un file all'ultima lezione, o alla lezione di quella data",
      "/spinoza schedule - mostra l'orario",
      "/spinoza class [data] [tema] - lega un messaggio a una lezione",
      "/spinoza - questa guida nella chat privata",
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
        "I file e le lezioni sono per i membri del gruppo che servo. Qui puoi:",
        "/ethics <ID> - un passo dell'Etica. Esempio: /ethics E1p7",
        "/ethics search <testo> - cerca un testo nell'Etica",
        "/? - questa guida",
      ].join("\n")
    }
    if (!full) return [this.introText(), "", ...this.sectionLines(), "", this.lettersText(), "Tutti i comandi: /??"].join("\n")
    // every operation of every section, one line each (the section help adds the details)
    const lines = [
      "FILE",
      "/files [modello] - mostra i file",
      "/get <numero|nome> - ricevi un file",
      "/delete <numero|nome> - sposta nel cestino",
      "/deleted - mostra i file cestinati",
      "/restore <numero|nome> - riporta indietro un file",
      "/space - spazio usato",
      "/files ? - dettagli",
      "",
      "LEZIONI",
      "/class [data] - una lezione e i suoi materiali",
      "/class list [mese|anno|archive] - gli elenchi e l'archivio delle lezioni",
      "/class schedule [giorno] [ora] - mostra o cambia l'orario",
      "/class move <data> [ora] - sposta una lezione",
      "/class cancel [data] - annulla una lezione",
      "/watch [on|off] - notifiche sui cambiamenti",
      "/class ? - dettagli",
      "",
      "SONDAGGI",
      "/vote - i sondaggi attivi",
      "/vote <domanda> | <opzione 1> | <opzione 2> - creane uno",
      "/vote <numero> - stato e risultati",
      "/vote close <numero> - chiudi",
      "/vote cancel <numero> - annulla",
      "/vote history - i sondaggi chiusi",
      "/vote ? - dettagli",
      "",
      "ETICA",
      "/ethics - il promemoria",
      "/ethics [full|all] <ID> - un passo: E1p7, часть 1 теорема 7",
      "/ethics search <testo> - cerca",
      "/ethics list <parte> - la struttura di una parte",
      "/ethics random - una proposizione a caso",
      "/ethics ? - identificatori e modalità",
      "",
      "NEL GRUPPO",
      ...this.groupFileLines(),
      "prius [data] - lega un file all'ultima lezione, o alla lezione di quella data (si usa come conatus)",
      "/spinoza class [data] [tema] - lega un messaggio a una lezione: come prima riga del messaggio, in risposta o come commento",
      "/spinoza schedule - mostra l'orario; /spinoza - la guida nella chat privata",
      "",
      "ALTRO",
      "/status - lo stato del bot",
      "/confirm, /drop - accetta o scarta un cambiamento mostrato in anteprima",
      "",
      "FORME BREVI",
      "Una lettera per la sezione, la parola inglese per l'operazione:",
      "/f = /files",
      "/f delete 2 = /files delete 2",
      "/c 19.09 = /class 19.09",
      "/c move 20:00 = /class move 20:00",
      "/v close 1 = /vote close 1",
      "/e full E1p7 = /ethics full E1p7",
      "/w on = /watch on",
      "Funzionano anche le forme russe /ф /з /г /э /у e /д /п /о",
      "",
      "GUIDA",
      "/? - i comandi principali",
      "/?? - tutti i comandi (questa guida)",
      "/<sezione> ? - la guida di una sezione: /f ?, /c ?, /v ?, /e ?",
    ]
    // /invite and /join are intentionally NOT listed here (admins learn them from the README) - do not add them back.
    if (isAdmin) lines.push("", "AMMINISTRATORE", "/admins - gli amministratori", "/unadmin <nome> - togli un amministratore")
    return lines.join("\n")
  },
  /** The greeting of a new private contact. @param {{latin, ref}|null} citation */
  greetingText(citation, isMember = true) {
    return this.withQuotationText(citation, this.helpText(false, isMember, false)) // the greeting IS the short help
  },
  /** A list line: the name (long ones shortened), size, date; an empty file is flagged instead of dated. */
  fileLineText(number, f) {
    const name = shortFileName(f.name)
    if (f.size === 0) return `${number}. ${name} · 0 B · vuoto o non scaricato del tutto`
    return `${number}. ${name} · ${this.sizeText(f.size)} · ${this.dateText(f.modifiedAt.toISOString().slice(0, 10))}`
  },
  listText(files, pattern, maxChars) {
    if (files.length === 0) return pattern ? `Nessun file salvato corrisponde a "${pattern}".\n\nElenco: /files` : "Non ci sono ancora file salvati."
    const head = `FILE · ${files.length}${pattern ? ` · modello ${pattern}` : ""} · dal più recente`
    const {lines, shown} = fitLines(files, maxChars - 100, (f, n) => this.fileLineText(n, f), head.length)
    const more = shown < files.length ? [`… e altri ${files.length - shown} - restringi: /files <modello>`] : []
    return [head, "", ...lines, ...more, "", "Ricevi: /get <numero>", "Filtro: /files <modello>", "Guida: /files ?"].join("\n")
  },
  notFoundText: (query) => `Il file "${query}" non esiste.\n\nElenco: /files`,
  unknownCommandText: (word, suggestion) => [`Non conosco il comando "${word}".`, "", ...(suggestion ? ["Forse intendevi:", suggestion, ""] : []), "Guida: /?", "Tutti i comandi: /??"].join("\n"),
  /** Too many files for one answer: a numbered choice. @param {string[]} names */
  tooManyText(query, names, maxChars) {
    const head = `TROVATI · ${names.length} · ${query}`
    const {lines, shown} = fitLines(names, maxChars - 80, (name, n) => `${n}. ${shortFileName(name)}`, head.length)
    const more = shown < names.length ? [`… e altri ${names.length - shown}`] : []
    return [head, "", ...lines, ...more, "", "Ricevi: /get <numero>", "Restringi: /get <nome>"].join("\n")
  },
  getUsageText: () => "Indica il numero o il nome del file.\n\nEsempio: /get 3\nElenco: /files",
  noSuchNumberText: (number, count) => (count === 0 ? "Non ho ancora mostrato nessun elenco.\n\nElenco: /files" : `Nell'elenco non c'è il numero ${number} - ne ha ${count}.\n\nElenco: /files`),
  sendFailedText: (name) => `Mi dispiace, non sono riuscito a inviare ${name}.`,
  deniedText: () => "Mi dispiace, questo è riservato ai membri del gruppo che servo.\n\nQui puoi: /?",

  promotionText(outcome, name) {
    switch (outcome) {
      case "granted":
        return `Benvenuto, ${name} - ora sei amministratore. Invia /?? per vedere i comandi di amministratore.`
      case "already":
        return "Sei già amministratore."
      case "disabled":
        return "L'accesso da amministratore non è configurato su questo bot."
      default:
        return "Segreto sbagliato."
    }
  },
  adminsOnlyText: () => "Mi dispiace, questo comando è solo per gli amministratori.",
  adminsListText: (admins) => (admins.length === 0 ? "Non ci sono ancora amministratori." : ["AMMINISTRATORI", "", ...admins.map((a) => `${a.name} · dal ${formatDate(a.since.slice(0, 10))}`), "", "Togli: /unadmin <nome>"].join("\n")),
  deleteUsageText: () => "Indica il numero o il nome esatto del file, uno alla volta.\n\nEsempio: /delete 3\nElenco: /files",
  /** @param {{classDate?: string|null, number?: number}} [o] classDate - the class card the file left; number - its number in the deleted folder now */
  deletedText(name, storedAs, {classDate = null, number = 1} = {}) {
    const head = `Ho spostato "${shortFileName(name)}" nel cestino${storedAs !== name ? ` con il nome "${shortFileName(storedAs)}"` : ""}.`
    return [head, ...(classDate ? [`Tolto dalla lezione del ${this.dateText(classDate)}.`] : []), "", `Riporta indietro: /restore ${number}`, "Cestino: /deleted"].join("\n")
  },
  /** @param {"delete"|"restore"} action */
  ambiguousNameText(query, candidates, total, action = "delete") {
    const command = action === "delete" ? "/delete" : "/restore"
    const head = `TROVATI · ${total} · ${query}`
    const rows = candidates.map((c, i) => `${i + 1}. ${shortFileName(c)}`)
    const more = total > candidates.length ? [`… e altri ${total - candidates.length}`] : []
    const verb = action === "delete" ? "Elimina" : "Riporta indietro"
    return [head, "", ...rows, ...more, "", total === 1 ? `${verb}: ${command} 1` : `${verb} uno alla volta: ${command} <numero>`].join("\n")
  },
  restoreUsageText: () => "Indica il numero o il nome esatto del file.\n\nEsempio: /restore 3\nElenco: /deleted",
  restoredText(name, storedAs, {classDate = null} = {}) {
    const head = `Ho riportato "${shortFileName(name)}" nell'archivio${storedAs !== name ? ` con il nome "${shortFileName(storedAs)}"` : ""}.`
    return [head, ...(classDate ? [`Di nuovo nella lezione del ${this.dateText(classDate)}.`] : []), "", "Elenco: /files"].join("\n")
  },
  deletedNotFoundText: (query) => `Nel cestino non c'è il file "${query}".\n\nCestino: /deleted`,
  deletedListText(files, maxChars) {
    if (files.length === 0) return "Il cestino è vuoto."
    const head = `CESTINO · ${files.length} · dal più recente`
    const {lines, shown} = fitLines(files, maxChars - 100, (f, n) => this.fileLineText(n, f), head.length)
    const more = shown < files.length ? [`… e altri ${files.length - shown}`] : []
    return [head, "", ...lines, ...more, "", "Riporta indietro: /restore <numero>", "Guida: /files ?"].join("\n")
  },
  /** @param {{used, reserved, limit, free, diskFree}} usage @param {{count, bytes, retentionMs}} deleted */
  spaceText(usage, deleted) {
    const lines = ["ARCHIVIO", "", `Occupato: ${this.sizeText(usage.used)} di ${this.sizeText(usage.limit)}`, `Libero in archivio: ${this.sizeText(usage.free)}`]
    if (usage.reserved > 0) lines.push(`In scaricamento ora: ${this.sizeText(usage.reserved)}`)
    lines.push("", deleted.count > 0 ? `Cestino: ${this.sizeText(deleted.bytes)} · ${plural(deleted.count, "file")}` : "Cestino vuoto")
    if (deleted.retentionMs > 0) lines.push(`Conservati per: ${plural(Math.round(deleted.retentionMs / 86_400_000), "giorno", "giorni")}`)
    if (usage.diskFree !== null) lines.push("", `Spazio libero sul disco: ${this.sizeText(usage.diskFree)}`)
    lines.push("", "Cestino: /deleted", "Guida: /files ?")
    return lines.join("\n")
  },
  statusText(s) {
    const hours = Math.floor(s.uptimeMs / 3_600_000)
    const minutes = Math.floor((s.uptimeMs % 3_600_000) / 60_000)
    return [
      "STATO",
      "",
      `${s.name} ${s.version} · attivo da ${hours} h ${minutes} min`,
      `Gruppi: ${s.groups.length > 0 ? s.groups.map((g) => g.title).join(", ") : "nessuno ancora"}`,
      s.fileCount > 0 ? `Archivio: ${plural(s.fileCount, "file")} · ${this.sizeText(s.usage.used)} di ${this.sizeText(s.usage.limit)}${s.usage.reserved > 0 ? ` · in scaricamento ${this.sizeText(s.usage.reserved)}` : ""}` : `Archivio vuoto · limite ${this.sizeText(s.usage.limit)}`,
      s.deleted.count > 0 ? `Cestino: ${plural(s.deleted.count, "file")} · ${this.sizeText(s.deleted.bytes)}` : "Cestino vuoto",
      s.classCount > 0 ? `Lezioni: ${s.classCount}` : "Non ci sono ancora lezioni",
      s.schedule ? `Orario: ${this.everyText(s.schedule, false)}` : "Nessun orario",
      ...(s.unknownCommands?.length > 0 ? [`Comandi sconosciuti: ${s.unknownCommands.map((u) => `${u.word} ×${u.count}`).join(", ")}`] : []),
      "",
      "Spazio: /space",
    ].join("\n")
  },
  /** @param {number} minutes the window of the limit */
  slowDownText: (minutes = 1) => `Troppi messaggi - aspetta ${minutes === 1 ? "un minuto" : plural(minutes, "minuto", "minuti")}, per favore.`,
  adminLockedText: () => "Troppi segreti sbagliati - per un'ora ignorerò /admin da parte tua.",
  unadminUsageText: () => "Chi devo togliere?\n\nEsempio: /unadmin sam\nElenco: /admins",
  unadminDoneText: (name) => `${name} non è più amministratore.\nI proprietari e gli amministratori del gruppo mantengono i diritti del loro ruolo nel gruppo.`,
  unadminNotFoundText: (name) => `L'amministratore "${name}" non esiste.\n\nElenco: /admins`,
  inviteText: (link) => `Invito monouso per una chat privata con me (valido per una persona):\n${link}`,
  joinUsageText: () => "Quale gruppo?\n\nEsempio: /join <link del gruppo> (il link dalle impostazioni del gruppo)",
  joiningText(result, groupPattern, matches) {
    const name = result.title ? `gruppo "${result.title}"` : "gruppo"
    switch (result.status) {
      case "joined":
        return `Sono già membro del ${name}.`
      case "own":
        return "Questo link è mio."
      case "notGroupLink":
        return "Questo non è un link di gruppo (sembra l'indirizzo di un contatto o un invito monouso)."
      default: {
        const head = `Mi sto collegando al ${name}… Entro automaticamente appena il gruppo mi accetta; puoi seguire la cosa nel mio registro.`
        return matches ? head : `${head}\nAttenzione: il ${name} non corrisponde al modello configurato "${groupPattern}", quindi non archivierò né distribuirò i suoi file.`
      }
    }
  },
  joinFailedText: (reason) => `Non sono riuscito a collegarmi con questo link: ${reason}`,

  /** "/ethics" without parameters - the practical memo. */
  ethicsHelpText: () => `SPINOZA, "ETICA"

Leggere:
/ethics E1p7 - il passo e la sua dimostrazione
/ethics full E1p7 - aggiungi scolii e corollari
/ethics all E1p7 - apri anche i passi citati

Cercare:
/ethics search любовь

Vedere la struttura:
/ethics list 3
/ethics random

In breve:
/e E1p7
/e full E1p7
/e all E1p7
/e search любовь
/e list 3
/e random

Guida: /ethics ?`,
  /** "/ethics ?" - the reference of identifiers, modes and search. */
  ethicsGuideText: () => `IDENTIFICATORI DELL'ETICA

Э1т7       parte I, proposizione 7
Э1т7док    dimostrazione
Э1т6кор1   primo corollario
Э1т8сх2    secondo scolio
Э1опр3     definizione 3
Э1акс1     assioma 1
Э2пост4    postulato 4
Э2лем3     lemma 3
Э3афф1     definizione dell'affetto 1

Senza "Э":
1т7

In lettere latine:
E1p7 oppure 1p7

MODALITÀ

/ethics <ID>
Il passo e la sua dimostrazione.

/ethics full <ID>
Aggiunge i corollari, gli scolii, le spiegazioni
e le note che appartengono al passo.

/ethics all <ID>
Il testo completo, poi i testi di tutti i passi citati.

RICERCA

/ethics search <testo>
/ethics search <testo> part <1-5>
/ethics search <testo> type <tipo>

Esempi:
/ethics search любовь part 3
/ethics search свобода type схолия

FORME BREVI

/e <ID>
/e full <ID> - full
/e all <ID> - all
/э п <testo> - search (ч <parte>, т <tipo>)
/э с <parte> - list
/e random - random`,
  /** @param {{rid: string, meaning: string}[]} hints what the identifier may have meant */
  ethicsNotFoundText(ref, hints = []) {
    if (hints.length === 0) return `Il passo "${ref}" non esiste.\n\nGuida: /ethics ?`
    return [`Il passo "${ref}" non esiste.`, "", "Forme possibili:", ...hints.map((h) => `${h.rid} - ${h.meaning}`), "", `Mostra tutto il passo: /ethics full ${hints[0].rid}`].join("\n")
  },
  ethicsUnknownModeText: (word, ref) => `Non conosco la modalità "${word}".\n\nForse intendevi:\n/ethics full ${ref}\n/ethics all ${ref}`,
  /** @param {{part?: number|null, type?: string|null}} [filter] what the search was limited to */
  ethicsSearchText(query, results, max, {part = null, type = null} = {}) {
    const scope = `${part ? ` · parte ${part}` : ""}${type ? ` · ${type}` : ""}`
    if (results.length === 0) return `Nessun risultato per "${query}"${scope}.\n\nGuida: /ethics ?`
    const shown = results.slice(0, max).map((e) => `${e.rid} (${e.type}): ${e.text.slice(0, 100)}…`)
    const more = results.length > max ? [`… e altri ${results.length - max}`] : []
    const narrow = part === null ? [`Restringi: /ethics search ${query} part <1-5>`] : []
    return [`RICERCA NELL'ETICA · ${query}${scope} · ${results.length}`, "", ...shown, ...more, "", "Apri: /ethics <ID>", ...narrow].join("\n")
  },
  /** "Proposizioni" - the plural label of an entry type in the structure summary */
  ethicsTypeLabel: (type) => ETHICS_TYPES[type] ?? type,
  /**
   * "/ethics list 3" - the structure of a part: how many entries of each type, not the entries themselves.
   * @param {Array<[string, number]>} counts type -> count in reading order
   */
  ethicsListText(part, counts) {
    if (part === null) return "Quale parte?\n\nEsempio: /ethics list 3"
    const total = counts.reduce((sum, [, n]) => sum + n, 0)
    return [`ETICA · PARTE ${ROMAN[part - 1] ?? part} · ${plural(total, "voce", "voci")}`, "", ...counts.map(([type, n]) => `${this.ethicsTypeLabel(type)} · ${n}`), "", `Elencale: /ethics list ${part} теоремы`, "Apri: /ethics <ID>"].join("\n")
  },
  /** "/ethics list 3 теоремы" - the entries of one type with the start of their text. */
  ethicsTypeListText(part, type, entries) {
    if (entries.length === 0) return `La parte ${ROMAN[part - 1] ?? part} non ha voci di tipo "${type}".\n\nStruttura: /ethics list ${part}`
    return [`ETICA · PARTE ${ROMAN[part - 1] ?? part} · ${this.ethicsTypeLabel(entries[0].type).toUpperCase()} · ${entries.length}`, "", ...entries.map((e) => `${e.rid} - ${e.text.length > 70 ? `${e.text.slice(0, 70)}…` : e.text}`), "", "Apri: /ethics <ID>"].join("\n")
  },
  ethicsContinuedText: (i, n) => `(parte ${i} di ${n})`,
  ethicsTruncatedText: (n) => `… il resto è omesso (più di ${n} messaggi). Chiedi pezzi più piccoli, per esempio /ethics full <ID>.`,

  // ---- classes ("занятия") ----
  weekdayName: (i) => ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"][i],
  dateText: (ymd) => formatDate(ymd),
  /** The technical form for the log: "martedì 19:00 (UTC)". */
  scheduleText(schedule) {
    return `${this.weekdayName(schedule.weekday)} ${schedule.time} (${schedule.timezone})`
  },
  /** "Ogni martedì alle 19:00" / "ogni martedì alle 19:00" */
  everyText(schedule, capital = true) {
    return `${capital ? "Ogni" : "ogni"} ${this.weekdayName(schedule.weekday)} alle ${schedule.time}`
  },
  moveUsageText: () => "Dove la sposto?\n\nEsempio: /class move 23.09 20:00\nSolo l'ora: /class move 20:00",
  cancelUsageText: () => "Quale lezione?\n\n/class cancel - la prossima\n/class cancel 23.09 - quella di quella data",
  noNextClassText: () => "Non ho trovato la prossima lezione.\n\nOrario: /class schedule",
  /** "19.09.2026, 12:15" - a class's date and time in sentences and cards */
  whenText(date, time) {
    return `${this.dateText(date)}${time ? `, ${time}` : ""}`
  },
  moveNoChangeText(date, time) {
    return `La lezione del ${this.dateText(date)} è già alle ${time}.`
  },
  /** The confirmation lines - the same under every preview. */
  confirmLinesText: (apply = false) => [`${apply ? "Applica" : "Conferma"}: /confirm`, "Scarta: /drop"],
  /** The preview of a move: a concrete date even when only a time was given. */
  movePreviewText(from, fromTime, to, time, itemCount) {
    const head = [from === to ? `Sposto la lezione del ${this.dateText(from)} dalle ${fromTime} alle ${time}?` : `Sposto la lezione del ${this.whenText(from, fromTime)} al ${this.whenText(to, time)}?`]
    const consequence = from !== to && itemCount > 0 ? ["I compiti e i file la seguono.", ""] : []
    return [...head, "", ...consequence, ...this.confirmLinesText()].join("\n")
  },
  classMovedText(from, to, time) {
    return from === to ? `La lezione del ${this.dateText(to)} ora comincia alle ${time}.` : `La lezione del ${this.dateText(from)} è spostata al ${this.whenText(to, time)}. I compiti e i file l'hanno seguita.`
  },
  /** Before a cancellation: the consequences and the request to confirm. */
  cancelConfirmText(date, time, following, followingTime, itemCount) {
    return [
      `Annullo la lezione del ${this.whenText(date, time)}?`,
      "",
      itemCount > 0 ? `I suoi compiti e i suoi file passano alla lezione del ${this.whenText(following, followingTime)}.` : `Per questa lezione non c'è ancora nulla; la lezione seguente è il ${this.whenText(following, followingTime)}.`,
      "",
      ...this.confirmLinesText(),
    ].join("\n")
  },
  /** the actions that show a preview - the same list under both "nothing to …" answers */
  previewersText: () => "Le anteprime vengono da: /class schedule, /class move, /class cancel, /vote",
  nothingToConfirmText() {
    return `Non c'è nulla da confermare.\n\n${this.previewersText()}`
  },
  nothingToDropText() {
    return `Non c'è nulla da scartare.\n\n${this.previewersText()}`
  },
  confirmationDroppedText: () => "Scartato, non è cambiato nulla.",
  classCancelledText(date, to) {
    return `La lezione del ${this.dateText(date)} è annullata. I suoi compiti e i suoi file sono passati al ${this.dateText(to)}.`
  },
  /** The private echo of a group announcement: what was said and where. @param {string[]} groupNames */
  announcedText: (text, groupNames) => `${text} Annunciato ${groupNames.length === 1 ? "nel gruppo" : "nei gruppi"} ${groupNames.map((n) => `"${n}"`).join(", ")}.`,
  classAlreadyCancelledText(date) {
    return `La lezione del ${this.dateText(date)} è già annullata o spostata.`
  },
  reminderText: (minutes, topic = null) => `La lezione comincia tra ${plural(minutes, "minuto", "minuti")}${topic ? `: ${topic}` : ""}.`,
  /** "Resta com'è: 19.09.2026, 12:15" - classes with materials keep their date and time under a new rule. @param {Array<{date, time}>} pinned */
  pinnedLinesText(pinned) {
    return pinned.length > 0 ? [pinned.length === 1 ? "Resta com'è:" : "Restano come sono:", ...pinned.map((p) => this.whenText(p.date, p.time)), ""] : []
  },
  /** The preview of a new schedule. @param {{date, time}|null} next @param {Array<{date, time}>} [pinned] */
  schedulePreviewText(schedule, next, pinned = []) {
    return ["NUOVO ORARIO", "", this.everyText(schedule), `Fuso orario: ${schedule.timezone}`, "", ...(next ? ["Prossima lezione:", this.whenText(next.date, next.time), ""] : []), ...this.pinnedLinesText(pinned), ...this.confirmLinesText(true)].join("\n")
  },
  scheduleSetText(schedule, next, pinned = []) {
    return [`Orario cambiato: ${this.everyText(schedule, false)}.`, ...(next ? [`Prossima lezione: ${this.whenText(next.date, next.time)}.`] : []), ...pinned.map((p) => `La lezione del ${this.whenText(p.date, p.time)} resta com'è.`), "Le lezioni passate, gli spostamenti, gli annullamenti e i materiali restano."].join("\n")
  },
  /** @param {{next: {date, time, movedFrom}|null, changes: Array<{kind, date, to?, time?}>}|null} outlook */
  scheduleShowText(schedule, outlook = null) {
    if (!schedule) return "Non c'è ancora un orario fisso.\n\nImpostalo: /class schedule <giorno> <hh:mm>\nEsempio: /class schedule tue 19:00"
    const lines = ["ORARIO", "", this.everyText(schedule), `Fuso orario: ${schedule.timezone}`]
    if (outlook?.next) lines.push("", "Prossima lezione:", `${this.whenText(outlook.next.date, outlook.next.time)}${outlook.next.movedFrom ? ` (spostata dal ${this.dateText(outlook.next.movedFrom)})` : ""}`)
    if (outlook?.changes.length > 0) {
      lines.push("", "Eccezioni:")
      for (const c of outlook.changes) {
        if (c.kind === "moved") lines.push(`${this.dateText(c.date)} · spostata al ${this.whenText(c.to, c.time)}`)
        else if (c.kind === "cancelled") lines.push(`${this.dateText(c.date)} · annullata`)
        else lines.push(`${this.dateText(c.date)} · comincia alle ${c.time}`)
      }
    }
    lines.push("", "Guida: /class ?")
    return lines.join("\n")
  },
  scheduleUsageText: () => "Uso: /class schedule <giorno> <hh:mm>\nEsempio: /class schedule tue 19:00",
  /** "settembre" */
  monthName: (m) => MONTHS[m - 1],
  /** "05.09" */
  shortDateText: (ymd) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`,
  /** "16.09.2026" - the day of an instant in the bot's time zone */
  dayOfText(iso, timezone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric"}).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
    return `${p.day}.${p.month}.${p.year}`
  },
  postTiedText(date, time) {
    return `Messaggio legato alla lezione del ${this.whenText(date, time)}.`
  },
  /** The short schedule for the group. @param {{date, time}|null} next @param {boolean} changeAsked someone tried to change it from the group */
  scheduleBriefText(schedule, next, changeAsked = false) {
    if (!schedule) return "Non c'è ancora un orario fisso."
    const lines = ["ORARIO", "", this.everyText(schedule), ...(next ? [`Prossima lezione: ${this.whenText(next.date, next.time)}`] : [])]
    if (changeAsked) lines.push("", "Per cambiarlo: nella chat privata, /class schedule")
    return lines.join("\n")
  },
  /** A file is on its class card now - one line in the group (recordings and readings alike). */
  savedToClassText(date, name) {
    return `Salvato nella lezione del ${this.dateText(date)}: ${shortFileName(name)}`
  },
  /** A private command typed in the group - one and the same line for any of them. */
  privateOnlyText: () => "Questo si fa nella chat privata: scrivimi o manda /spinoza.",
  attachFailedText: (name) => `Non sono riuscito ad aggiungere ${name} alla lezione: non è nell'archivio e non si può più scaricare. Per favore, pubblica di nuovo il file.`,
  /** A file a class command asked for was refused: the archive is full, or its name is not allowed. @param {"full"|"unsafe"} reason */
  attachRefusedText: (name, reason) => `Non sono riuscito ad aggiungere ${shortFileName(name)} alla lezione: ${reason === "full" ? "l'archivio è pieno" : "un nome di file con un percorso o caratteri di controllo non è ammesso"}.`,
  recordingNeedsDateText: () => "Quale lezione? Aggiungi la data: prius <data>.",
  /** prius with no file near it (in the group). */
  noFileText(word = "prius") {
    return `Quale file? Scrivi ${word} nella didascalia del file, in risposta al file o subito dopo che è stato pubblicato.`
  },
  /** "1 messaggio · 2 file · registrazione" or "niente per ora". @param {{posts, files}|null} session */
  materialsText(session) {
    if (!session) return "niente per ora"
    const readings = session.files.filter((f) => f.kind !== "audio").length
    const parts = [...(session.posts.length > 0 ? [plural(session.posts.length, "messaggio", "messaggi")] : []), ...(readings > 0 ? [plural(readings, "file")] : []), ...(session.files.some((f) => f.kind === "audio") ? ["registrazione"] : [])]
    return parts.length > 0 ? parts.join(" · ") : "niente per ora"
  },
  classStatusText: (status) => ({next: "prossima", planned: "in programma", past: "passata", moved: "spostata", cancelled: "annullata"})[status],
  /**
   * The card of one class - only what is filled in (see domain/ClassCalendar.js classCard).
   * @param {{date, time, status, topic, posts, files, movedFrom, movedTo, schedule}} card
   * @param {{footer?: boolean}} [options] footer - the link to the list (not in the group)
   */
  classCardText(card, {footer = true} = {}) {
    const head = card.status === "next" ? "PROSSIMA LEZIONE" : `LEZIONE · ${this.classStatusText(card.status)}`
    const lines = [head, "", this.whenText(card.date, card.time)]
    if (card.topic) lines.push(`Tema: ${card.topic}`)
    if (card.movedFrom) lines.push(`Spostata dal ${this.dateText(card.movedFrom)}`)
    if (card.status === "moved") lines.push(`Spostata al ${this.dateText(card.movedTo)}`)
    if (card.status === "cancelled") lines.push(`Compiti e file passati al ${this.dateText(card.movedTo)}`)
    for (const p of card.posts) if (p.text) lines.push("", `Compiti (${p.author}${p.editedAt ? `, modificato il ${this.dateText(p.editedAt.slice(0, 10))}` : ""}):`, p.text)
    const readings = card.files.filter((f) => f.kind !== "audio")
    const audio = card.files.filter((f) => f.kind === "audio")
    let n = 0 // the numbers continue across the two blocks: /д <number> refers to them (see Syllabus)
    if (readings.length > 0) lines.push("", "File:", ...readings.map((f) => `${++n}. ${shortFileName(f.name)}`))
    if (audio.length > 0) lines.push("", "Registrazione:", ...audio.map((f) => `${++n}. ${shortFileName(f.name)}`))
    if (card.posts.every((p) => !p.text) && card.files.length === 0 && card.status !== "cancelled" && card.status !== "moved") lines.push("", "Non c'è ancora nulla.")
    if (card.schedule) lines.push("", `Orario: ${this.everyText(card.schedule, false)}`)
    if (footer) lines.push("", ...(card.files.length > 0 ? ["Ricevi: /д <numero>"] : []), "Tutte le lezioni: /class list", "Guida: /class ?")
    return lines.join("\n")
  },
  noSessionsText: () => "Non ci sono ancora lezioni.\n\nOrario: /class schedule <giorno> <hh:mm>\nNel gruppo: /spinoza class - segna un messaggio di lezione",
  sessionNotFoundText: (what) => `La lezione "${what}" non esiste.\n\nElenco: /class list`,
  /** A list line: date, time (for future ones), topic, materials; moved and cancelled markers. @param {{date, time, status, session}} c */
  classLineText(c, {withTime = c.status === "next" || c.status === "planned", withStatus = false} = {}) {
    if (c.status === "cancelled") return `${this.shortDateText(c.date)} · annullata`
    if (c.status === "moved") return `${this.shortDateText(c.date)} · spostata al ${this.shortDateText(c.session.movedTo)}`
    const parts = [this.shortDateText(c.date) + (withTime && c.time ? `, ${c.time}` : "")]
    if (withStatus) parts.push(this.classStatusText(c.status))
    if (c.session?.topic) parts.push(c.session.topic)
    parts.push(this.materialsText(c.session))
    return parts.join(" · ")
  },
  /** "/classes": a few upcoming and recent classes. @param {{upcoming, recent, year, month}} o */
  classesOverviewText({upcoming, recent, year, month}) {
    const lines = ["LEZIONI"]
    if (upcoming.length > 0) lines.push("", "In arrivo:", ...upcoming.map((c) => this.classLineText(c, {withTime: true})))
    if (recent.length > 0) lines.push("", "Recenti:", ...recent.map((c) => this.classLineText(c, {withTime: false})))
    if (upcoming.length === 0 && recent.length === 0) lines.push("", "Non ci sono ancora lezioni.")
    lines.push("", `Mese: /class list ${String(month).padStart(2, "0")}.${year}`, "Archivio: /class list archive", "Guida: /class ?")
    return lines.join("\n")
  },
  /** "/classes 09.2026": every class of the month. @param {{year, month, items}} o */
  classesMonthText({year, month, items}) {
    const prev = month === 1 ? `12.${year - 1}` : `${String(month - 1).padStart(2, "0")}.${year}`
    const next = month === 12 ? `01.${year + 1}` : `${String(month + 1).padStart(2, "0")}.${year}`
    const body = items.length > 0 ? items.map((c) => this.classLineText(c, {withStatus: true})) : ["Nessuna lezione in questo mese."]
    return [`LEZIONI · ${this.monthName(month).toUpperCase()} ${year}`, "", ...body, "", `Precedente: /class list ${prev}`, `Successivo: /class list ${next}`].join("\n")
  },
  /** "/classes 2026": the months of a year with their counts. @param {Map<number, number>} counts */
  classesYearText(year, counts) {
    const body = counts.size > 0 ? [...counts].map(([m, n]) => `${this.monthName(m)} · ${plural(n, "lezione", "lezioni")}`) : ["Nessuna lezione in quest'anno."]
    const last = [...counts.keys()].at(-1)
    return [`LEZIONI · ${year}`, "", ...body, "", `Apri un mese: /class list ${last ? `${String(last).padStart(2, "0")}.${year}` : "<mm.yyyy>"}`].join("\n")
  },
  /** "/classes archive": the years with their counts. @param {Map<number, number>} counts latest first */
  classesArchiveText(counts) {
    const body = counts.size > 0 ? [...counts].map(([y, n]) => `${y} · ${plural(n, "lezione", "lezioni")}`) : ["Non ci sono ancora lezioni."]
    const years = [...counts.keys()]
    return ["ARCHIVIO DELLE LEZIONI", "", ...body, "", `Apri un anno: /class list ${years.length > 1 ? years[1] : (years[0] ?? "<anno>")}`].join("\n")
  },
  classesUsageText: (argument = null) => `Quale periodo?\n\n/class list - in arrivo e recenti\n/class list 09.2026 - un mese\n/class list 2026 - un anno\n/class list archive - tutti gli anni\nUna lezione: /class ${argument ?? "<data>"}`,
  /** "/class ?": the whole section. */
  classHelpText: () => [
    "LEZIONI",
    "",
    "/class [data]",
    "La prossima lezione, o quella di quella data.",
    "Breve: /з [data]",
    "",
    "/class list [mese|anno|archive]",
    "L'elenco e l'archivio delle lezioni.",
    "Breve: /з с",
    "",
    "/class schedule [giorno] [ora]",
    "Mostra o cambia l'orario settimanale.",
    "Breve: /з р",
    "",
    "/class move <data> [ora]",
    "Sposta una lezione.",
    "Breve: /з п",
    "",
    "/class cancel [data]",
    "Annulla una lezione.",
    "Breve: /з о",
    "",
    "I cambiamenti valgono dopo /confirm (/п); /drop (/о) li scarta.",
    "Date: 19.09, 19 сентября, 2026-09-19, today, tomorrow, friday.",
    "I file di una lezione si prendono con il loro numero sulla scheda: /д <numero>.",
    "Compiti e messaggi si modificano e si cancellano nel gruppo, la scheda segue; un file si toglie con /ф у <numero>.",
  ].join("\n"),
  /** "/files ?": the whole section. */
  filesHelpText: () => [
    "FILE",
    "",
    "/files [modello]",
    "I file salvati, dal più recente; un modello come *.pdf restringe l'elenco.",
    "Anche: /list, /ф",
    "",
    "/get <numero|nome>",
    "Ricevi un file per numero nell'elenco o per nome.",
    "Anche: /д, /files get, /ф д",
    "",
    "/delete <numero|nome>",
    "Sposta un file nel cestino (uno alla volta).",
    "Anche: /files delete, /ф у",
    "",
    "/deleted",
    "I file cestinati; restano per un tempo limitato.",
    "Anche: /files deleted, /ф к",
    "",
    "/restore <numero|nome>",
    "Riporta un file dal cestino.",
    "Anche: /files restore, /ф в",
    "",
    "/space",
    "Spazio usato e libero.",
    "Anche: /files space, /ф м",
    "",
    "I numeri si riferiscono all'ultimo elenco mostrato.",
  ].join("\n"),
  watchUsageText: () => "Manda /watch on oppure /watch off; senza parola ti dico se sono attive.",
  watchStatusText: (on) => (on ? "Le notifiche sulle lezioni sono attive: ti scrivo in privato quando i compiti cambiano, si aggiunge un file o arriva una registrazione.\n\nPer spegnerle: /watch off" : "Le notifiche sulle lezioni sono spente.\n\nPer accenderle: /watch on"),
  sessionChangedText(date, changes) {
    const parts = []
    if (changes.some((c) => c.kind === "post")) parts.push(`nuovo messaggio (${uniqueNames(changes, "post")})`)
    if (changes.some((c) => c.kind === "edit")) parts.push(`compiti modificati (${uniqueNames(changes, "edit")})`)
    const files = changes.filter((c) => c.kind === "file")
    if (files.length > 0) parts.push(`file aggiunti: ${files.map((c) => shortFileName(c.name)).join(", ")}`)
    if (changes.some((c) => c.kind === "audio")) parts.push("registrazione pubblicata")
    for (const c of changes.filter((c) => c.kind === "moved")) parts.push(`spostata qui dal ${this.dateText(c.from)} (${c.by})`)
    for (const c of changes.filter((c) => c.kind === "cancelled")) parts.push(`la lezione del ${this.dateText(c.from)} è annullata, i suoi materiali ora sono qui (${c.by})`)
    return `Lezione del ${this.dateText(date)}: ${parts.join("; ")}.\n\nDettagli: /class ${this.shortDateText(date)}`
  },

  // ---- polls ----
  /** "16.09.2026, 18:00" in the bot's time zone */
  instantText(iso, timezone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
    return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}`
  },
  /** "/vote ?": the whole section. */
  pollHelpText: () => [
    "SONDAGGI",
    "",
    "/vote",
    "I miei sondaggi attivi.",
    "Breve: /г",
    "",
    "/vote <domanda> | <opzione 1> | <opzione 2> [| …]",
    `Crea un sondaggio (fino a ${POLL_REACTIONS.length} opzioni). Ne vedi un'anteprima; dopo /confirm viene pubblicato come un unico messaggio nel gruppo e i membri votano con le reazioni.`,
    "Parametri: --days <n> (durata; senza, il sondaggio si chiude dopo 8 giorni senza voti), --multiple (si possono scegliere più opzioni), --group <nome> (quando i gruppi sono più di uno)",
    "",
    "/vote <numero>",
    "Stato e risultati.",
    "Breve: /г <numero>",
    "",
    "/vote close <numero>",
    "Chiudi (l'autore o un amministratore).",
    "Breve: /г з <numero>",
    "",
    "/vote cancel <numero>",
    "Annulla un sondaggio pubblicato - con una conferma.",
    "Breve: /г о <numero>",
    "",
    "/vote history",
    "Sondaggi chiusi e annullati.",
    "Breve: /г и",
    "",
    "Esempio: /г Quando ci vediamo? | lunedì 18:30 | martedì 18:30 --days 3",
  ].join("\n"),
  pollNoActiveText: () => "Nessun sondaggio attivo.\n\nCreane uno: /vote <domanda> | <opzione 1> | <opzione 2>\nEsempio: /vote Quando ci vediamo? | lunedì 18:30 | martedì 18:30\nGuida: /vote ?",
  pollErrorText(code) {
    switch (code) {
      case "noSeparator":
        return "Non sono riuscito a separare la domanda dalle opzioni.\n\nUsa il carattere | :\n/vote Quando ci vediamo? | lunedì | martedì"
      case "fewOptions":
        return "Mi servono una domanda e almeno due opzioni, separate da | :\n/vote Quando ci vediamo? | lunedì | martedì"
      case "tooManyOptions":
        return `Troppe opzioni: le reazioni bastano per ${POLL_REACTIONS.length}.`
      default:
        return "La durata è un numero intero di giorni da 1 a 365: --days 3"
    }
  },
  pollLimitText: (max) => `Hai già ${plural(max, "sondaggio attivo", "sondaggi attivi")}.\n\nChiudine uno: /vote close <numero>`,
  pollNoGroupText: () => "Non sono ancora in nessun gruppo, quindi non c'è dove pubblicare.",
  pollGroupAmbiguousText: (names) => `Servo più gruppi - dimmi dove pubblicare: --group <nome>. Gruppi: ${names.join(", ")}.`,
  pollGroupUnknownText: (name, names) => `Non ho nessun gruppo "${name}". Gruppi: ${names.join(", ")}.`,
  pollOptionsText(poll, counts = null, leaders = []) {
    const mark = leaders.length > 1 ? " · pari merito" : " · scelta"
    return poll.options.map((o, i) => `${POLL_REACTIONS[i]} ${o}${counts ? ` · ${counts[i]}${leaders.includes(i) ? mark : ""}` : ""}`).join("\n")
  },
  pollModeText: (poll) => (poll.multiple ? "più opzioni" : "una sola opzione"),
  pollPreviewText(poll, timezone) {
    return [
      "NUOVO SONDAGGIO",
      "",
      poll.question,
      "",
      this.pollOptionsText(poll),
      "",
      `Modalità: ${this.pollModeText(poll)}`,
      `Durata: ${poll.days ? plural(poll.days, "giorno", "giorni") : (poll.idleDays ? `senza limite; si chiude dopo ${plural(poll.idleDays, "giorno", "giorni")} senza voti` : "senza limite")}`,
      `Gruppo: ${poll.group.name}`,
      ...(poll.closesAt ? [`Chiude: ${this.instantText(poll.closesAt, timezone)}`] : []),
      "",
      ...this.confirmLinesText(),
    ].join("\n")
  },
  /** The message in the group: the same one is edited after every vote and at the end. */
  pollPostText(poll, {counts, participants, leaders}, timezone) {
    const closed = poll.status === "closed" || poll.status === "cancelled"
    const head = `SONDAGGIO #${poll.id}${poll.status === "closed" ? " · CHIUSO" : poll.status === "cancelled" ? " · ANNULLATO" : ""}`
    const lines = [head, "", poll.question, "", this.pollOptionsText(poll, participants > 0 || closed ? counts : null, poll.status === "closed" ? leaders : []), ""]
    if (!closed) lines.push(poll.multiple ? "Scegli quante opzioni vuoi con le reazioni." : "Scegli una sola opzione con una reazione.")
    if (participants > 0 || closed) lines.push(plural(participants, "voto", "voti"))
    const ending = closed ? `Concluso: ${this.instantText(poll.closedAt ?? poll.closesAt, timezone)}${poll.closedBy === "idle" ? ` · ${plural(poll.idleDays, "giorno", "giorni")} senza voti` : ""}` : poll.closesAt ? `Chiude: ${this.instantText(poll.closesAt, timezone)}` : null
    if (ending) lines.push(ending) // a poll without a deadline says nothing about closing in the group: its author is told privately
    return lines.join("\n")
  },
  pollPublishedText: (poll) => `Il sondaggio #${poll.id} è pubblicato nel gruppo "${poll.group.name}".${!poll.closesAt && poll.idleDays ? `\n\n${`Nessuna scadenza: se nessuno vota per ${plural(poll.idleDays, "giorno", "giorni")}, il sondaggio si chiude da solo.`}` : ""}\n\nApri: /vote ${poll.id}\n${poll.closesAt ? "Chiudi in anticipo" : "Chiudi"}: /vote close ${poll.id}`,
  pollCancelConfirmText(poll) {
    return [`Annullo il sondaggio #${poll.id} "${poll.question}"?`, "", "Il messaggio nel gruppo sarà segnato come annullato.", "", ...this.confirmLinesText()].join("\n")
  },
  pollCancelledText: (poll) => `Il sondaggio #${poll.id} è annullato.`,
  pollNotFoundText: (id) => `Il sondaggio #${id} non esiste.\n\nElenco: /vote\nStorico: /vote history`,
  pollNotOpenText: (id) => `Il sondaggio #${id} è già chiuso o annullato.`,
  pollNotYoursText: (id) => `Solo il suo autore o un amministratore può gestire il sondaggio #${id}.`,
  pollShowText(poll, result, timezone) {
    return this.pollPostText(poll, result, timezone) + (poll.status === "open" ? `${!poll.closesAt && poll.idleDays ? `\n\n${`Nessuna scadenza: se nessuno vota per ${plural(poll.idleDays, "giorno", "giorni")}, il sondaggio si chiude da solo.`}` : ""}\n\n${poll.closesAt ? "Chiudi in anticipo" : "Chiudi"}: /vote close ${poll.id}` : "")
  },
  pollClosedText(poll, result, timezone) {
    return `Il sondaggio #${poll.id} è chiuso.\n\n${this.pollPostText(poll, result, timezone)}`
  },
  /** The active polls: number and question, below them the votes and the deadline. */
  pollListText(items, timezone) {
    const width = Math.max(...items.map(({poll}) => String(poll.id).length))
    const rows = items.flatMap(({poll, tally: r, closesOn}) => [`${String(poll.id).padEnd(width)}  ${poll.question}`, `${" ".repeat(width)}  ${plural(r.participants, "voto", "voti")} · ${poll.closesAt ? `fino al ${this.instantText(poll.closesAt, timezone)}` : closesOn ? `si chiude il ${this.instantText(new Date(closesOn).toISOString(), timezone)} se nessuno vota` : "senza scadenza"}`, ""])
    return ["SONDAGGI ATTIVI", "", ...rows, `Apri: /vote ${items.length === 1 ? items[0].poll.id : "<numero>"}`, "Crea: /vote <domanda> | <opzione 1> | <opzione 2>", "Guida: /vote ?"].join("\n")
  },
  pollHistoryText(items, timezone) {
    if (items.length === 0) return "Non ci sono ancora sondaggi chiusi.\n\nElenco: /vote"
    const width = Math.max(...items.map(({poll}) => String(poll.id).length))
    const rows = items.flatMap(({poll, tally: r}) => [`${String(poll.id).padEnd(width)}  ${poll.question}`, `${" ".repeat(width)}  ${poll.status === "cancelled" ? "annullato" : plural(r.participants, "voto", "voti")} · ${this.dayOfText(poll.closedAt ?? poll.closesAt ?? poll.createdAt, timezone)}`, ""])
    return [`STORICO DEI SONDAGGI · ${items.length}`, "", ...rows, "Apri: /vote <numero>"].join("\n")
  },
}

function uniqueNames(changes, kind) {
  return [...new Set(changes.filter((c) => c.kind === kind).map((c) => c.by))].join(", ")
}
