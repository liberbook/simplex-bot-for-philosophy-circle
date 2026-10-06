import fs from "node:fs"

/**
 * Spinoza's "Ethica" (Russian translation) as an indexed corpus: lookup by
 * identifier, rendering with proofs/corollaries/scholia, substring search.
 * Pure data access - no chat knowledge.
 *
 * Entry: {id: "1p7", part: 1, type: "теорема", number: 7, parent: null, text, rid: "Э1т7"}
 *
 * Identifiers: Э{part}{type}{n}, e.g. Э1т7 (theorem 7 of part 1), Э1т11док
 * (its proof), Э1т8сх2 (scholium 2), Э1опр3 (definition), Э2аксф3 / Э2опрф (axiom /
 * definition about bodies after 2p13), Прим24 (translator's note).
 * Latin forms are accepted too: E1p7 / 1p7 / 1p11dem.
 */

// russian -> latin id fragments (order matters: longest / most specific first)
const RU2EN = [
  ["аксф", "physax"], ["опрф", "physdef"], ["приб", "app"], ["пред", "pref"], ["пост", "post"], ["афф", "aff"], ["ооа", "gda"],
  ["опр", "d"], ["акс", "a"], ["лем", "lem"], ["док", "dem"], ["кор", "c"], ["сх", "s"], ["об", "exp"], ["т", "p"],
]
const CHILD_ORDER = {доказательство: 0, королларий: 1, схолия: 2, объяснение: 3}
const REF_RE = /\[([^\]]+)\]/g
const ROMAN = ["", "I", "II", "III", "IV", "V"]
// words of a natural request ("часть 1 теорема 7") -> identifier fragment
const NATURAL_TYPES = new Map([
  ...["теорема", "теор", "т", "theorem", "proposition", "prop"].map((w) => [w, "т"]),
  ...["определение", "опр", "definition", "def"].map((w) => [w, "опр"]),
  ...["аксиома", "акс", "axiom"].map((w) => [w, "акс"]),
  ...["постулат", "postulate"].map((w) => [w, "пост"]),
  ...["лемма", "lemma"].map((w) => [w, "лем"]),
  ...["предисловие", "preface"].map((w) => [w, "пред"]),
  ...["прибавление", "appendix"].map((w) => [w, "приб"]),
  ...["глава", "chapter"].map((w) => [w, "приб"]),
])

export const RenderMode = Object.freeze({DEFAULT: "default", FULL: "full", ALL: "all"})

// words people type for an entry type ("/этика список 1 теоремы") -> the type as the corpus names it (a substring match)
const TYPE_WORDS = new Map([
  ...["теоремы", "теорема", "т", "theorems", "theorem", "propositions"].map((w) => [w, "теорема"]),
  ...["определения", "определение", "опр", "definitions", "definition"].map((w) => [w, "определение"]),
  ...["аксиомы", "аксиома", "акс", "axioms", "axiom"].map((w) => [w, "аксиома"]),
  ...["постулаты", "постулат", "пост", "postulates", "postulate"].map((w) => [w, "постулат"]),
  ...["леммы", "лемма", "лем", "lemmas", "lemma"].map((w) => [w, "лемма"]),
  ...["доказательства", "доказательство", "док", "proofs", "proof"].map((w) => [w, "доказательство"]),
  ...["королларии", "королларий", "кор", "corollaries", "corollary"].map((w) => [w, "королларий"]),
  ...["схолии", "схолия", "сх", "scholia", "scholium"].map((w) => [w, "схолия"]),
  ...["объяснения", "объяснение", "explanations", "explanation"].map((w) => [w, "объяснение"]),
  ...["аффекты", "аффект", "афф", "affects", "affect"].map((w) => [w, "определение аффекта"]),
  ...["главы", "глава", "chapters", "chapter"].map((w) => [w, "прибавление (глава)"]),
  ...["примечания", "примечание", "прим", "notes", "note"].map((w) => [w, "примечание"]),
])

export class EthicaIndex {
  /** @param {{[key: string]: object}} db latin id -> entry */
  constructor(db) {
    this.db = db
    this.byParent = new Map()
    for (const e of Object.values(db)) {
      if (e.parent) this.byParent.set(e.parent, [...(this.byParent.get(e.parent) ?? []), e])
    }
    for (const kids of this.byParent.values()) kids.sort((a, b) => (CHILD_ORDER[a.type] ?? 9) - (CHILD_ORDER[b.type] ?? 9) || (a.number ?? 0) - (b.number ?? 0))
    this.theorems = Object.values(db).filter((e) => e.type === "теорема")
  }

  static load(filePath) {
    return new EthicaIndex(JSON.parse(fs.readFileSync(filePath, "utf8")))
  }

  /** "Э1т7" / "э1т7" / "1т7" / "E1p7" -> "1p7"; "Прим12" -> "note12" */
  static toLatin(ref) {
    const s = ref.trim()
    if (/^[Ee]?\d/.test(s) && !/[а-яА-Я]/.test(s)) return s.replace(/^[Ee]/, "").toLowerCase()
    let m = /^[Пп]рим\.?\s*(\d+)$/.exec(s)
    if (m) return `note${m[1]}`
    const body = s.replace(/^[Ээ]/, "").toLowerCase()
    m = /^(\d+)(.*)$/.exec(body)
    if (!m) return ref
    let rest = m[2]
    for (const [cyr, lat] of RU2EN) rest = rest.replaceAll(cyr, lat)
    return `${m[1]}${rest}`
  }

  /**
   * "часть 1 теорема 7" / "теорема 7 части 1" / "part 2 definition 3" -> {ref: "Э1т7", rest}
   * where `rest` is the text without those words; null when the text is not such a request.
   */
  static fromNatural(text) {
    const s = String(text ?? "")
    const partRe = /(?:^|\s)(?:част[ьи]|ч\.?|part)\s*(\d)(?=\s|$)/iu
    const part = partRe.exec(s)
    if (!part) return null
    let m = null
    for (const [word, code] of NATURAL_TYPES) {
      const re = new RegExp(`(?:^|\\s)${word}\\s+(\\d+)(?=\\s|$)`, "iu")
      const found = re.exec(s)
      if (found && (!m || found.index < m.index)) m = {match: found[0], code, number: found[1]}
    }
    if (!m) return null
    const rest = s.replace(partRe, " ").replace(m.match, " ").replace(/\s{2,}/g, " ").trim()
    return {ref: `Э${part[1]}${m.code}${m.number}`, rest}
  }

  get(ref) {
    return this.db[EthicaIndex.toLatin(ref)] ?? this.db[ref] ?? null
  }

  /**
   * What an identifier stands for: "Часть I · Теорема 7", "Часть I · Теорема 6 · Королларий 1",
   * "Часть IV · Прибавление · Глава 5", "Примечание 12".
   */
  describe(entry) {
    const chain = []
    for (let e = entry; e; e = e.parent ? this.db[e.parent] : null) chain.unshift(e)
    const parts = chain.map((e) => {
      if (e.type === "прибавление (глава)") return `Прибавление · Глава ${e.number}`
      return `${capitalize(e.type)}${e.number ? ` ${e.number}` : ""}`
    })
    return entry.part ? `Часть ${ROMAN[entry.part]} · ${parts.join(" · ")}` : parts.join(" · ")
  }

  /**
   * Entries an unknown identifier may have meant: the passage its stem names
   * and that passage's children ("Э1т7кор" -> Э1т7, Э1т7док, Э1т7кор1 ...).
   * @returns {object[]} up to `max` entries in reading order
   */
  suggest(ref, max = 6) {
    let key = EthicaIndex.toLatin(ref)
    while (key.length > 1) {
      const stem = this.db[key]
      if (stem) return [stem, ...this.childrenOf(stem.id)].slice(0, max)
      key = key.slice(0, -1)
    }
    return []
  }

  childrenOf(id) {
    return this.byParent.get(id) ?? []
  }

  /** Full text for an identifier in the given mode, or null when unknown. */
  render(ref, mode = RenderMode.DEFAULT) {
    const entry = this.get(ref)
    if (!entry) return null
    const main = this.#block(entry, mode)
    if (mode !== RenderMode.ALL) return main
    const refs = this.#collectRefs(main, entry.id)
    if (refs.length === 0) return main
    const tail = ["\n" + "─".repeat(40), "УПОМЯНУТЫЕ ПОЛОЖЕНИЯ (теоремы — без доказательств):"]
    for (const key of refs) tail.push(`\n${this.label(this.db[key])}\n${this.db[key].text}`)
    return `${main}\n${tail.join("\n")}`
  }

  /** "[Э1т7] Часть I · Теорема 7" - the identifier and its meaning, as every answer starts. */
  label(entry) {
    return `[${entry.rid}] ${this.describe(entry)}`
  }

  /** Case-insensitive substring search, optionally limited to a part (1-5) and a type substring. */
  search(query, {part = null, type = null} = {}) {
    const q = query.toLowerCase()
    return Object.values(this.db).filter((e) => (part === null || e.part === part) && (type === null || e.type.includes(type)) && e.text.toLowerCase().includes(q))
  }

  /** All entries (of one part, of one type if given), in reading order. `type` matches as a substring like in search(). */
  list(part = null, type = null) {
    return Object.values(this.db).filter((e) => (part === null || e.part === part) && (type === null || e.type.includes(type)))
  }

  /** The structure of a part: how many entries of each type, in reading order. @returns {Array<[string, number]>} */
  countByType(part) {
    const counts = new Map()
    for (const e of this.list(part)) counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
    return [...counts]
  }

  /** "теоремы" / "theorems" / "т" -> "теорема"; null for a word that names no type. */
  static typeOf(word) {
    return TYPE_WORDS.get(String(word ?? "").toLowerCase()) ?? null
  }

  randomTheorem(random = Math.random) {
    return this.theorems[Math.floor(random() * this.theorems.length)]
  }

  #block(entry, mode) {
    const out = [this.label(entry), entry.text]
    if (entry.type === "теорема" || entry.type === "лемма") {
      let kids = this.childrenOf(entry.id)
      if (mode === RenderMode.DEFAULT) kids = kids.filter((c) => c.type === "доказательство")
      for (const c of kids) out.push(`[${capitalize(c.type)}${c.number ? ` ${c.number}` : ""}] ${c.text}`)
    }
    return out.join("\n\n")
  }

  #collectRefs(text, excludeId) {
    const seen = new Set([excludeId])
    const ordered = []
    for (const m of text.matchAll(REF_RE)) {
      for (const tok of m[1].split(",")) {
        const key = EthicaIndex.toLatin(tok.trim())
        if (this.db[key] && !seen.has(key)) {
          seen.add(key)
          ordered.push(key)
        }
      }
    }
    return ordered
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
