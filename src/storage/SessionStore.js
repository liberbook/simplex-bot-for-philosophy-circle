import fs from "node:fs"
import path from "node:path"
import {ClassSchedule} from "../domain/ClassSchedule.js"

/**
 * Classes and the weekly schedule, persisted as one JSON file in the state
 * directory: {schedule, sessions: {"YYYY-MM-DD": Session}}. Pure data access.
 */
export class SessionStore {
  constructor(filePath, {timezone = "UTC"} = {}) {
    this.filePath = filePath
    this.timezone = timezone
  }

  /** @returns {ClassSchedule|null} */
  getSchedule() {
    return ClassSchedule.fromJSON(this.#read().schedule, this.timezone)
  }

  setSchedule(schedule) {
    const data = this.#read()
    data.schedule = schedule ? schedule.toJSON() : null
    this.#write(data)
  }

  get(date) {
    return this.#read().sessions[date] ?? null
  }

  /** Inserts or replaces a session (stamps updatedAt). */
  save(session, now = new Date()) {
    const data = this.#read()
    data.sessions[session.date] = {...session, updatedAt: now.toISOString()}
    this.#write(data)
    return data.sessions[session.date]
  }

  remove(date) {
    const data = this.#read()
    delete data.sessions[date]
    this.#write(data)
  }

  /** All sessions, oldest first. */
  list() {
    return Object.values(this.#read().sessions).sort((a, b) => a.date.localeCompare(b.date))
  }

  findByPost(groupId, itemId) {
    return this.list().find((s) => s.posts.some((p) => p.groupId === groupId && p.itemId === itemId)) ?? null
  }

  /** The class whose card lists the archive file `name`. */
  findByFile(name) {
    return this.list().find((s) => s.files.some((f) => f.name === name)) ?? null
  }

  /** The class a file now in the deleted folder (as `name`) was taken off. */
  findByDeletedFile(name) {
    return this.list().find((s) => s.deletedFiles.some((f) => f.name === name)) ?? null
  }

  /**
   * Migration of archives with one folder per class: rewrites every "YYYY-MM-DD/name"
   * reference to the file's root name (`renamed`: old -> new), falling back to the bare name. @returns {number} references rewritten
   */
  renameFiles(renamed, {logger = null} = {}) {
    const data = this.#read()
    let count = 0
    for (const session of Object.values(data.sessions)) {
      for (const list of [session.files, session.deletedFiles]) {
        for (const file of list) {
          if (!file.name.includes("/")) continue
          const name = renamed.get(file.name)
          if (!name) logger?.warn(`class ${session.date}: ${file.name} was not found on disk - the card now refers to ${path.basename(file.name)}`)
          file.name = name ?? path.basename(file.name)
          count++
        }
      }
    }
    if (count > 0) this.#write(data)
    return count
  }

  /** Files purged from the deleted folder are no longer restorable: forget them. */
  forgetDeletedFiles(names) {
    if (names.length === 0) return
    const gone = new Set(names)
    const data = this.#read()
    let changed = false
    for (const session of Object.values(data.sessions)) {
      const kept = session.deletedFiles.filter((f) => !gone.has(f.name))
      if (kept.length === session.deletedFiles.length) continue
      session.deletedFiles = kept
      changed = true
    }
    if (changed) this.#write(data)
  }

  #read() {
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"))
      const sessions = data.sessions ?? {}
      for (const s of Object.values(sessions)) s.deletedFiles ??= [] // state files may lack the field
      return {schedule: data.schedule ?? null, sessions}
    } catch {
      return {schedule: null, sessions: {}}
    }
  }

  #write(data) {
    fs.mkdirSync(path.dirname(this.filePath), {recursive: true})
    const tmp = `${this.filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n")
    fs.renameSync(tmp, this.filePath)
  }
}
