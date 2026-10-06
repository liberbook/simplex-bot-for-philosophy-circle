import {CommandKind, parseCommand} from "../domain/Command.js"
import {EthicaIndex, RenderMode} from "../ethics/EthicaIndex.js"

/**
 * Private-chat behaviour around Spinoza's Ethics: answers /ethics (show,
 * search, list, random). Long texts are split into several messages.
 */
export class Philosopher {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("../ethics/EthicaIndex.js").EthicaIndex} deps.index
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   */
  constructor({gateway, index, replies, logger, maxChunkChars = 3500, maxChunks = 6, maxSearchResults = 25, random = Math.random}) {
    this.random = random // for "/этика случайно"; fixed in the generated INTERFACE.md
    this.gateway = gateway
    this.index = index
    this.replies = replies
    this.logger = logger
    this.maxChunkChars = maxChunkChars
    this.maxChunks = maxChunks
    this.maxSearchResults = maxSearchResults
  }

  /** @returns {Promise<boolean>} true if the message was an /ethics command */
  async handle(message) {
    if (!message.isDirect || !message.incoming) return false
    const command = parseCommand(message.text)
    if (command.kind !== CommandKind.ETHICS) return false
    const request = parseEthicsRequest(command.argument)
    this.logger.info(`${message.sender.name}: ethics ${request.action}${request.ref ? ` ${request.ref}` : ""}${request.query ? ` "${request.query}"` : ""}`)
    await this.#send(message.chat, this.#answer(request))
    return true
  }

  #answer(r) {
    if (r.unknown && r.action === "show") return this.replies.ethicsUnknownModeText(r.unknown, r.ref)
    switch (r.action) {
      case "show":
        return this.index.render(r.ref, r.mode) ?? this.replies.ethicsNotFoundText(r.ref, this.index.suggest(r.ref).map((e) => ({rid: e.rid, meaning: this.index.describe(e)})))
      case "random": {
        const t = this.index.randomTheorem(this.random)
        return this.index.render(t.rid, r.mode)
      }
      case "search":
        return this.replies.ethicsSearchText(r.query, this.index.search(r.query, {part: r.part, type: r.type}), this.maxSearchResults, {part: r.part, type: r.type})
      case "list":
        if (r.part !== null && r.type) return this.replies.ethicsTypeListText(r.part, r.type, this.index.list(r.part, r.type))
        return this.replies.ethicsListText(r.part, r.part === null ? [] : this.index.countByType(r.part))
      case "guide":
        return this.replies.ethicsGuideText()
      default:
        return this.replies.ethicsHelpText()
    }
  }

  async #send(chat, text) {
    const chunks = splitText(text, this.maxChunkChars)
    const shown = chunks.slice(0, this.maxChunks)
    for (const [i, chunk] of shown.entries()) {
      const suffix = shown.length > 1 ? `\n\n${this.replies.ethicsContinuedText(i + 1, shown.length)}` : ""
      await this.gateway.sendText(chat, chunk + suffix)
    }
    if (chunks.length > shown.length) await this.gateway.sendText(chat, this.replies.ethicsTruncatedText(this.maxChunks))
  }
}

// one-letter forms: о (полн - объяснения), в (всё), п (поиск), с (список), л (случайно), ч (часть), т (тип)
const WORDS = {
  full: ["полн", "о", "пл", "полно", "--полно", "full", "--full"],
  all: ["всё", "все", "в", "вс", "весь", "связи", "--связи", "all", "--all"],
  search: ["поиск", "п", "найти", "найди", "search", "--search"],
  list: ["список", "с", "сп", "list", "--list"],
  random: ["случайно", "л", "сл", "случайная", "случайный", "random"],
  part: ["часть", "ч", "--часть", "part", "--part"],
  type: ["тип", "т", "--тип", "type", "--type"],
  help: ["помощь", "help", "справка", "?"],
}
const isWord = (group, token) => WORDS[group].includes(token.toLowerCase())

/**
 * Tolerant parsing of the text after "/ethics": modes are plain words in
 * Russian or English (полн ID, всё ID), short (пл, вс, п, сп, сл) or
 * flags (--full ID). "/ethics" alone is the practical memo
 * ("help"); "/ethics ?" is the reference of identifiers and modes ("guide").
 * @returns {{action: "help"|"guide"|"show"|"random"|"search"|"list", ref: string|null, mode: string, query: string|null, part: number|null, type: string|null, unknown: string|null}}
 *   `unknown`: a word that looked like a mode but is not one (for a corrective hint)
 */
export function parseEthicsRequest(argument) {
  const natural = EthicaIndex.fromNatural(argument) // "часть 1 теорема 7 --полно"
  const tokens = (natural ? natural.rest : (argument ?? "").trim()).split(/\s+/).filter(Boolean)
  const r = {action: "help", ref: natural?.ref ?? null, mode: RenderMode.DEFAULT, query: null, part: null, type: null, unknown: null}
  const queryWords = []
  let collectingQuery = false
  let helpAsked = false
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (isWord("full", t)) r.mode = RenderMode.FULL
    else if (isWord("all", t)) r.mode = RenderMode.ALL
    else if (isWord("help", t)) helpAsked = true
    else if (isWord("random", t)) r.action = "random"
    else if (isWord("list", t)) r.action = "list"
    else if (isWord("search", t)) {
      r.action = "search"
      collectingQuery = true
    } else if (isWord("part", t) && /^\d$/.test(tokens[i + 1] ?? "")) {
      r.part = Number(tokens[++i])
      collectingQuery = false
    } else if (isWord("type", t) && tokens[i + 1]) {
      r.type = tokens[++i].toLowerCase()
      collectingQuery = false
    } else if (collectingQuery) queryWords.push(t)
    else if (r.action === "list" && /^\d$/.test(t)) r.part = Number(t)
    else if (r.action === "list" && EthicaIndex.typeOf(t)) r.type = EthicaIndex.typeOf(t) // "/этика список 1 теоремы"
    else if (r.ref === null) r.ref = t
    else if (r.unknown === null) r.unknown = t
  }
  if (r.action === "search") {
    if (queryWords.length === 0 && r.ref) queryWords.push(r.ref)
    r.query = queryWords.join(" ") || null
    if (!r.query) r.action = "help"
  } else if (r.action === "help" && r.ref) r.action = "show"
  if (helpAsked) r.action = "guide"
  return r
}

/** Splits at paragraph, then line, then hard boundaries so that no piece exceeds maxChars. */
export function splitText(text, maxChars) {
  if (text.length <= maxChars) return [text]
  const chunks = []
  let rest = text
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf("\n\n", maxChars)
    if (cut < maxChars / 2) cut = rest.lastIndexOf("\n", maxChars)
    if (cut < maxChars / 2) cut = rest.lastIndexOf(" ", maxChars)
    if (cut < maxChars / 2) cut = maxChars
    chunks.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest) chunks.push(rest)
  return chunks
}
