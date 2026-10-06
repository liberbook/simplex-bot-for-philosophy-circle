/**
 * A class ("занятие"): one date, the posts that announce it (homework text,
 * edited until the class), the files to read and the recording afterwards.
 * Pure data and pure helpers - no I/O, no chat knowledge.
 *
 * Session {date: "YYYY-MM-DD", topic: string|null, posts: SessionPost[], files: SessionFile[], deletedFiles: SessionFile[],
 *          createdAt, updatedAt,
 *          time?: "hh:mm"|null (this class starts at another time than the schedule says),
 *          status?: "planned"|"moved"|"cancelled" (absent = planned), movedTo?: "YYYY-MM-DD"|null (where a
 *          moved/cancelled class's materials went), movedFrom?: "YYYY-MM-DD"|null (the regular date this class
 *          was moved from), remindedAt?: string|null (the group reminder was posted)}
 * SessionPost {itemId, groupId, author, text, sentAt, editedAt: string|null}
 * SessionFile {name: "reading.pdf", kind: "reading"|"audio", addedAt, author} - a REFERENCE to a file of the
 *          archive by its name there; the archive is flat, a class never owns a folder. `deletedFiles` are the
 *          references taken off the card by /delete (or a post deleted for everyone), `name` being the file's
 *          name in the deleted folder, so /restore can put the file back on its card.
 */
import {lastClass, nextClass} from "./ClassCalendar.js"
import {addDays, parseWeekday, weekdayOf} from "./ClassSchedule.js"

export const FileKind = Object.freeze({READING: "reading", AUDIO: "audio"})
export const SessionStatus = Object.freeze({PLANNED: "planned", MOVED: "moved", CANCELLED: "cancelled"})

export function newSession(date, now = new Date()) {
  const at = now.toISOString()
  return {date, topic: null, posts: [], files: [], deletedFiles: [], time: null, status: SessionStatus.PLANNED, movedTo: null, movedFrom: null, remindedAt: null, createdAt: at, updatedAt: at}
}

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".ogg", ".opus", ".wav", ".aac", ".flac", ".wma", ".amr"])

/** Voice messages and audio files. @param {{name: string, contentType?: string}} file */
export function isAudio(file) {
  if (!file) return false
  if (file.contentType === "voice") return true
  const dot = file.name.lastIndexOf(".")
  return dot >= 0 && AUDIO_EXTENSIONS.has(file.name.slice(dot).toLowerCase())
}

export function fileKind(file) {
  return isAudio(file) ? FileKind.AUDIO : FileKind.READING
}

const MONTHS_RU = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"]
const RELATIVE_DAYS = new Map([
  ...["сегодня", "today"].map((w) => [w, 0]),
  ...["завтра", "tomorrow"].map((w) => [w, 1]),
  ...["послезавтра"].map((w) => [w, 2]),
])
const WEEKDAY_RE = /(?:^|[^\p{L}])(?:в[ои]?\s+)?(вс|пн|вт|ср|чт|пт|сб|воскресенье|понедельник|вторник|среда|среду|четверг|пятница|пятницу|суббота|субботу|sun|mon|tue|wed|thu|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?![\p{L}])/iu

/** The calendar day "now" falls on in the schedule's zone (UTC without a schedule) - the anchor for "today", "tomorrow", weekdays. */
export function todayFor(schedule, now = new Date()) {
  return schedule ? schedule.localDate(now) : now.toISOString().slice(0, 10)
}

/**
 * Finds a date in free text: "14.09", "14.09.2026", "14/09", "2026-09-14",
 * "14 сентября [2026]", "сегодня", "завтра", a weekday ("в пятницу" = the
 * coming Friday, today included). A missing year is the one that puts the date
 * nearest to `now`; relative words count from `today`.
 * @returns {{date: string, matched: string}|null} the date and the text it was read from
 */
function findDate(text, now = new Date(), today = todayFor(null, now)) {
  const s = String(text ?? "")
  let m = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(s)
  if (m) return found(validDate(Number(m[1]), Number(m[2]), Number(m[3])), m[0])
  m = /(?<!\d)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?(?!\d)/.exec(s)
  if (m) {
    const year = m[3] === undefined ? null : m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return found(withYear(Number(m[2]), Number(m[1]), year, now), m[0])
  }
  m = /(?<!\d)(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?/iu.exec(s)
  if (m) {
    const month = MONTHS_RU.findIndex((stem) => m[2].toLowerCase().startsWith(stem)) + 1
    if (month > 0 && (month !== 5 || /^ма[яй]/i.test(m[2]))) return found(withYear(month, Number(m[1]), m[3] ? Number(m[3]) : null, now), m[0])
  }
  for (const [word, offset] of RELATIVE_DAYS) {
    const re = new RegExp(`(?:^|[^\\p{L}])(${word})(?![\\p{L}])`, "iu")
    const r = re.exec(s)
    if (r) return {date: addDays(today, offset), matched: r[1]}
  }
  m = WEEKDAY_RE.exec(s)
  if (m) {
    const wanted = parseWeekday(m[1])
    const ahead = (wanted - weekdayOf(today) + 7) % 7
    return {date: addDays(today, ahead), matched: m[0].trim()}
  }
  return null
}

const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

/**
 * A month for the class lists: "09.2026", "9.26", "сентябрь", "сентябрь 2026",
 * "september 2026". A missing year is the current one. @returns {{year: number, month: number}|null}
 */
export function parseMonth(text, now = new Date()) {
  const s = String(text ?? "").trim().toLowerCase()
  let m = /^(\d{1,2})[./](\d{4}|\d{2})$/.exec(s)
  if (m) {
    const month = Number(m[1])
    const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
    return month >= 1 && month <= 12 ? {year, month} : null
  }
  m = /^([a-zа-яё]+)(?:\s+(\d{4}))?$/iu.exec(s)
  if (!m) return null
  let month = MONTHS_RU.findIndex((stem) => m[1].startsWith(stem)) + 1
  if (month === 5 && !/^ма[яй]/.test(m[1])) month = 0
  if (month === 0) month = MONTHS_EN.findIndex((stem) => m[1].startsWith(stem)) + 1
  return month > 0 ? {year: m[2] ? Number(m[2]) : now.getUTCFullYear(), month} : null
}

/** @returns {string|null} "YYYY-MM-DD" - see findDate */
export function parseDate(text, now = new Date(), today = todayFor(null, now)) {
  return findDate(text, now, today)?.date ?? null
}

function found(date, matched) {
  return date ? {date, matched} : null
}

function withYear(month, day, year, now) {
  if (year !== null) return validDate(year, month, day)
  const thisYear = now.getUTCFullYear()
  let best = null
  for (const y of [thisYear - 1, thisYear, thisYear + 1]) {
    const candidate = validDate(y, month, day)
    if (!candidate) continue
    const distance = Math.abs(Date.parse(candidate) - now.getTime())
    if (best === null || distance < best.distance) best = {candidate, distance}
  }
  return best?.candidate ?? null
}

function validDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return d.toISOString().slice(0, 10)
}

/** "2026-09-14" -> "14.09.2026" */
export function formatDate(ymd) {
  const [y, m, d] = ymd.split("-")
  return `${d}.${m}.${y}`
}

/**
 * Splits an announcement "/занятие [date] [topic]\nhomework text..." into its
 * parts. The first line carries the command (`commandWords` words, e.g. 2 for
 * "/spinoza занятие"); the rest is the homework text.
 * @returns {{date: string|null, topic: string|null, text: string}}
 */
export function parseAnnouncement(text, now = new Date(), commandWords = 1, today = todayFor(null, now)) {
  const lines = String(text ?? "").split("\n")
  let first = lines[0].trim()
  for (let i = 0; i < commandWords; i++) first = first.replace(/^\/?\S+\s*/, "")
  const when = findDate(first, now, today)
  let topic = when ? first.replace(when.matched, "").replace(/\s{2,}/g, " ").trim() : first
  topic = topic.replace(/^[-:,]\s*/, "").trim() || null
  return {date: when?.date ?? null, topic, text: lines.slice(1).join("\n").trim()}
}

/**
 * Which class a group message belongs to.
 *  - an explicit date always wins;
 *  - a recording goes to the most recent past class, if it was within `recentAfterMs`;
 *  - anything else (homework text, files to read) prepares the next class.
 * Moved and cancelled classes are skipped (see ClassCalendar).
 * @param {object} p
 * @param {import("./ClassSchedule.js").ClassSchedule|null} p.schedule
 * @param {object[]} [p.sessions] all recorded sessions
 * @returns {string|null} "YYYY-MM-DD", or null when it cannot be decided
 */
export function resolveClassDate({schedule, sessions = [], now = new Date(), explicitDate = null, audio = false, recentAfterMs = 7 * 86_400_000}) {
  if (explicitDate) return explicitDate
  if (!schedule) return null
  if (audio) {
    const last = lastClass({schedule, sessions, now})
    return last && now.getTime() - last.instant.getTime() <= recentAfterMs ? last.date : null
  }
  return nextClass({schedule, sessions, now})?.date ?? null
}
