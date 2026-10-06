/**
 * Counts the slash-words nobody understood ("/лист"), so that /status can show
 * what people try and the hints can be improved. Only the first word is kept,
 * never the rest of the message. In memory; a restart starts afresh.
 */
export class UnknownCommands {
  constructor() {
    this.counts = new Map()
  }

  record(word) {
    const key = String(word).toLowerCase().slice(0, 30)
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1)
  }

  /** @returns {{word: string, count: number}[]} most frequent first */
  top(n = 5) {
    return [...this.counts.entries()]
      .map(([word, count]) => ({word, count}))
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
      .slice(0, n)
  }
}
