import fs from "node:fs"
import path from "node:path"

/**
 * Polls, persisted as one JSON file in the state directory:
 * {nextId, polls: {"12": Poll}}. Ids are small numbers people can type.
 * Pure data access.
 */
export class PollStore {
  constructor(filePath) {
    this.filePath = filePath
  }

  /** Stores a new poll under the next free number. @returns the stored poll (with id) */
  add(poll) {
    const data = this.#read()
    const stored = {...poll, id: data.nextId}
    data.polls[stored.id] = stored
    data.nextId++
    this.#write(data)
    return stored
  }

  save(poll) {
    const data = this.#read()
    data.polls[poll.id] = poll
    this.#write(data)
    return poll
  }

  get(id) {
    return this.#read().polls[id] ?? null
  }

  /** All polls, oldest first. */
  list() {
    return Object.values(this.#read().polls).sort((a, b) => a.id - b.id)
  }

  findByPost(groupId, itemId) {
    return this.list().find((p) => p.group.id === groupId && p.itemId === itemId) ?? null
  }

  #read() {
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"))
      return {nextId: data.nextId ?? 1, polls: data.polls ?? {}}
    } catch {
      return {nextId: 1, polls: {}}
    }
  }

  #write(data) {
    fs.mkdirSync(path.dirname(this.filePath), {recursive: true})
    const tmp = `${this.filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n")
    fs.renameSync(tmp, this.filePath)
  }
}
