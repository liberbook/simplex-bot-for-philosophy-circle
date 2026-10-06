/**
 * The fetch word ("conatus"): written in the group as a reply to a file, or
 * right after one, it asks the bot to send that file privately. Every file is
 * kept anyway; the word only decides what to send.
 *
 *   mentions(text) - the text uses the word: maybe a request, maybe a sentence
 *   isBare(text)   - the text IS the word (punctuation aside): a request for sure, not
 *                    a sentence about the concept ("conatus" is a term of the Ethics, after all)
 */
export class TriggerWord {
  constructor(word) {
    if (!word) throw new Error("trigger word must not be empty")
    this.word = word
    this.pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(word)}([^\\p{L}\\p{N}_]|$)`, "iu")
    this.bare = new RegExp(`^[^\\p{L}\\p{N}]*${escapeRegExp(word)}[^\\p{L}\\p{N}]*$`, "iu")
  }

  mentions(text) {
    return this.pattern.test(text ?? "")
  }

  isBare(text) {
    return this.bare.test(text ?? "")
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
