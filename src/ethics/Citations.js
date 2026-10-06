import fs from "node:fs"

/**
 * Latin quotations from Spinoza's Ethics with their Russian translation and
 * the identifier of the passage for /ethics (data/spinoza_citations.json).
 * Hands them out in a shuffled cycle: no repeats until every quotation was
 * shown, never the same one twice in a row.
 *
 * Citation {latin, translation_ru, source: "Ethica, I, Propositio 7", ref: "Э1т7", show_in_spinoza_help?: boolean}
 */
export class Citations {
  /** @param {object[]} entries @param {() => number} [rng] */
  constructor(entries, rng = Math.random) {
    this.entries = Object.freeze(entries.filter((e) => e.show_in_spinoza_help !== false).map((e) => Object.freeze({...e})))
    this.rng = rng
    this.queue = []
    this.previous = null
  }

  static load(file, rng = Math.random) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"))
    return new Citations(data.citations ?? [], rng)
  }

  list() {
    return this.entries
  }

  /** The next quotation of the cycle, or null when there are none. */
  next() {
    if (this.entries.length === 0) return null
    if (this.queue.length === 0) {
      this.queue = shuffle([...this.entries], this.rng)
      if (this.queue.length > 1 && this.queue[0] === this.previous) this.queue.push(this.queue.shift())
    }
    this.previous = this.queue.shift()
    return this.previous
  }
}

function shuffle(items, rng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}
