import fs from "node:fs"
import path from "node:path"

/** Contacts who asked to be told about changes to classes (state/subscribers.json). */
export class SubscriberStore {
  constructor(filePath) {
    this.filePath = filePath
  }

  /** @returns {{contactId: number, name: string, since: string}[]} */
  list() {
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"))
      return Array.isArray(data.subscribers) ? data.subscribers : []
    } catch {
      return []
    }
  }

  has(contactId) {
    return this.list().some((s) => s.contactId === contactId)
  }

  /** Subscribes (on = true) or unsubscribes explicitly. @returns {boolean} whether anything changed */
  set({contactId, name}, on) {
    const current = this.list()
    const has = current.some((s) => s.contactId === contactId)
    if (on === has) return false
    this.#save(on ? [...current, {contactId, name, since: new Date().toISOString()}] : current.filter((s) => s.contactId !== contactId))
    return true
  }

  #save(subscribers) {
    fs.mkdirSync(path.dirname(this.filePath), {recursive: true})
    const tmp = `${this.filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({subscribers}, null, 2) + "\n")
    fs.renameSync(tmp, this.filePath)
  }
}
