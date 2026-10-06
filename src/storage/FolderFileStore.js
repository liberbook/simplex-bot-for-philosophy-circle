import fs from "node:fs"
import path from "node:path"
import {StoredFile} from "../domain/StoredFile.js"
import {globMatcher} from "../util/glob.js"

/**
 * A flat folder of files (the archive, or the "deleted" folder): the directory
 * listing is the source of truth, so files the CLI saved (or that were copied
 * in by hand) are all served. Names come from readdir and are only ever joined
 * to this store's directory, so a request can never reach outside the folder.
 * A class keeps references to files by name (SessionFile) - nothing here knows
 * about classes. `flatten()` migrates archives with one subfolder per class.
 *
 * Interface (FileStore): ensure(), list(glob?), find(query), exact(name),
 * pathOf(name), moveTo(name, targetStore), flatten(), purgeOlderThan(ms),
 * usedBytes(), freeDiskBytes()
 */
/** A class folder of the per-class archive layout: "2026-09-19". */
const CLASS_FOLDER = /^\d{4}-\d{2}-\d{2}$/

export class FolderFileStore {
  #used = null // {stamp, at, bytes} - see usedBytes()

  constructor(dir) {
    this.dir = path.resolve(dir)
  }

  ensure() {
    fs.mkdirSync(this.dir, {recursive: true})
  }

  /** @returns {StoredFile[]} sorted by name */
  list(glob = "") {
    const matches = glob ? globMatcher(glob) : null
    return this.#names()
      .filter((n) => !matches || matches(n))
      .map((n) => this.#describe(n))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Files whose name equals `name`, case-insensitively (normally 0 or 1). */
  exact(name) {
    const wanted = name.toLowerCase()
    return this.list().filter((f) => f.name.toLowerCase() === wanted)
  }

  /** Exact (case-insensitive) match first, then glob. */
  find(query) {
    const exact = this.exact(query)
    return exact.length > 0 ? exact : this.list(query)
  }

  /** Absolute path of a stored file; throws for unknown names. */
  pathOf(name) {
    if (!this.#names().includes(name)) throw new Error(`not a stored file: ${name}`)
    return path.join(this.dir, name)
  }

  /**
   * Moves a stored file into another store. A name already taken there gets a
   * timestamp suffix. The moved file's modification time becomes `now`, so
   * retention in the target store counts from the move.
   * @returns {string} the name the file has in the target store
   */
  moveTo(name, target, now = new Date()) {
    const source = this.pathOf(name)
    fs.mkdirSync(target.dir, {recursive: true})
    const storedAs = freeName(target.dir, name, now)
    const destination = path.join(target.dir, storedAs)
    try {
      fs.renameSync(source, destination)
    } catch (e) {
      if (e.code !== "EXDEV") throw e
      fs.copyFileSync(source, destination)
      fs.unlinkSync(source)
    }
    fs.utimesSync(destination, now, now)
    return storedAs
  }

  /**
   * Migrates an archive with one subfolder per class: lifts the files of every
   * class folder (named YYYY-MM-DD, nothing else is touched) to the root (a taken
   * name gets a timestamp suffix) and removes the emptied folders. A folder that
   * cannot be read or moved is left as it is.
   * @returns {Map<string, string>} "folder/name" -> the file's name at the root
   */
  flatten(now = new Date()) {
    const moved = new Map()
    let entries
    try {
      entries = fs.readdirSync(this.dir, {withFileTypes: true})
    } catch {
      return moved
    }
    for (const e of entries) {
      if (!e.isDirectory() || !CLASS_FOLDER.test(e.name)) continue
      const folder = path.join(this.dir, e.name)
      try {
        for (const sub of fs.readdirSync(folder, {withFileTypes: true})) {
          if (!sub.isFile()) continue
          const storedAs = freeName(this.dir, sub.name, now)
          fs.renameSync(path.join(folder, sub.name), path.join(this.dir, storedAs))
          moved.set(`${e.name}/${sub.name}`, storedAs)
        }
        fs.rmdirSync(folder) // fails unless empty - then it holds something that is not ours
      } catch {
        /* unreadable, not movable or not empty: keep it */
      }
    }
    return moved
  }

  /** Removes files not modified for `maxAgeMs`. @returns {string[]} the removed names */
  purgeOlderThan(maxAgeMs, now = Date.now()) {
    const removed = []
    for (const f of this.list()) {
      if (now - f.modifiedAt.getTime() <= maxAgeMs) continue
      try {
        fs.unlinkSync(path.join(this.dir, f.name))
        removed.push(f.name)
      } catch {
        /* disappeared meanwhile */
      }
    }
    return removed
  }

  /**
   * Total size of the files at the root - counted again when the folder changed
   * (files arrive and leave by rename/unlink: the CLI downloads into its temp
   * folder) and at least once a minute (a file written in place by hand).
   */
  usedBytes(now = Date.now()) {
    let stamp
    try {
      stamp = fs.statSync(this.dir).mtimeMs
    } catch {
      return 0
    }
    if (this.#used?.stamp !== stamp || now - this.#used.at > 60_000) this.#used = {stamp, at: now, bytes: this.list().reduce((sum, f) => sum + f.size, 0)}
    return this.#used.bytes
  }

  /** Free space on the filesystem holding the folder, or null if unknown. */
  freeDiskBytes() {
    try {
      const st = fs.statfsSync(this.dir)
      return Number(st.bavail) * Number(st.bsize)
    } catch {
      return null
    }
  }

  /** Names of all regular files at the root. */
  #names() {
    try {
      return fs.readdirSync(this.dir, {withFileTypes: true}).filter((e) => e.isFile()).map((e) => e.name)
    } catch {
      return []
    }
  }

  #describe(name) {
    try {
      const st = fs.statSync(path.join(this.dir, name))
      return new StoredFile({name, size: st.size, modifiedAt: st.mtime})
    } catch {
      return null
    }
  }
}

/** A base name not yet used in `dir`: the name itself, else a timestamped variant. */
function freeName(dir, name, now) {
  let candidate = name
  for (let n = 0; fs.existsSync(path.join(dir, candidate)); n++) candidate = timestampedName(name, now, n)
  return candidate
}

/** "report.pdf" + 2026-09-07T18:12:03Z -> "report.20260907-181203.pdf" (n > 0 appends "-n"). */
export function timestampedName(name, date, n = 0) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)
  const ext = path.extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  return `${base}.${stamp}${n > 0 ? `-${n}` : ""}${ext}`
}
