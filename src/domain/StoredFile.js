/** A file kept in the bot's archive. Pure data. `name` is the file's name in the store (the archive is flat). */
export class StoredFile {
  /** @param {{name: string, size: number, modifiedAt: Date}} p */
  constructor({name, size, modifiedAt}) {
    this.name = name
    this.size = size
    this.modifiedAt = modifiedAt
    Object.freeze(this)
  }
}
