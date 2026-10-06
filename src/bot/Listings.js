/**
 * The numbered lists the bot showed in each chat ("/список", "/корзина"), so
 * that a number in a later command refers to the same file the person saw.
 * Pure in-memory bookkeeping; a bot restart simply falls back to the current order.
 */
export class Listings {
  constructor() {
    this.shown = new Map() // `${kind}:${chatId}` -> names in the order shown
  }

  /** @param {"archive"|"deleted"} kind */
  remember(kind, chatId, names) {
    this.shown.set(`${kind}:${chatId}`, [...names])
  }

  /**
   * The name a number refers to: from the list last shown in the chat, else from `current`.
   * @returns {{name: string|null, count: number}}
   */
  resolve(kind, chatId, number, current) {
    const names = this.shown.get(`${kind}:${chatId}`) ?? current
    return {name: number >= 1 && number <= names.length ? names[number - 1] : null, count: names.length}
  }
}
