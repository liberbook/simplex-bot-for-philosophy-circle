import fs from "node:fs"
import path from "node:path"

/**
 * Persistent list of admin contacts (a JSON file in the state directory).
 * Pure data access: who is an admin is decided elsewhere (AdminPolicy).
 */
export class AdminRegistry {
  constructor(filePath) {
    this.filePath = filePath
  }

  /** @returns {{contactId: number, name: string, since: string}[]} */
  list() {
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"))
      return Array.isArray(data.admins) ? data.admins : []
    } catch {
      return []
    }
  }

  has(contactId) {
    return contactId != null && this.list().some((a) => a.contactId === contactId)
  }

  add({contactId, name}) {
    if (this.has(contactId)) return false
    this.#save([...this.list(), {contactId, name, since: new Date().toISOString()}])
    return true
  }

  remove(contactId) {
    const before = this.list()
    const after = before.filter((a) => a.contactId !== contactId)
    if (after.length === before.length) return false
    this.#save(after)
    return true
  }

  #save(admins) {
    fs.mkdirSync(path.dirname(this.filePath), {recursive: true})
    const tmp = `${this.filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({admins}, null, 2) + "\n")
    fs.renameSync(tmp, this.filePath) // atomic: a crash never leaves a truncated file
  }
}
