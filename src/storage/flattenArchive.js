import {fileKind} from "../domain/Session.js"

/**
 * Start-up migration of archives with one subfolder per class (in the archive
 * and in the deleted folder) to the flat archive: lifts every such file to the
 * root and rewrites the class references. Files lifted out of `deleted/<date>/` are remembered
 * by that class as deleted, so /restore still returns them to their card.
 * Idempotent: nothing happens when there are no subfolders.
 * @returns {{files: number, deleted: number, references: number}} what was migrated
 */
export function flattenArchive({store, deleted, sessions, logger, now = new Date()}) {
  const lifted = store.flatten(now)
  const references = lifted.size > 0 || sessions.list().some(hasFolderNames) ? sessions.renameFiles(lifted, {logger}) : 0
  const trashed = deleted.flatten(now)
  for (const [oldName, name] of trashed) {
    const date = oldName.slice(0, oldName.indexOf("/"))
    const session = sessions.get(date)
    if (!session || session.deletedFiles.some((f) => f.name === name)) continue
    session.deletedFiles.push({name, kind: fileKind({name}), addedAt: now.toISOString(), author: ""})
    sessions.save(session, now)
  }
  const result = {files: lifted.size, deleted: trashed.size, references}
  if (lifted.size + trashed.size + references > 0) logger.info(`class folders flattened: ${lifted.size} file(s) lifted to the archive root, ${trashed.size} in the deleted folder, ${references} card reference(s) rewritten`)
  return result
}

const hasFolderNames = (s) => [...s.files, ...s.deletedFiles].some((f) => f.name.includes("/"))
