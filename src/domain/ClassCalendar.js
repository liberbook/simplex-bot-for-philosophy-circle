import {addDays, weekdayOf} from "./ClassSchedule.js"

/**
 * Which class is next, which was last: the weekly schedule plus per-class
 * exceptions recorded in the sessions - a class moved to another date/time
 * (status "moved" on the old date, `time` on the new one) or cancelled
 * (status "cancelled"). Pure functions over data; no I/O.
 *
 * A session is "active" unless its status is "moved" or "cancelled".
 */
const WEEKS_AHEAD = 8

export function isActive(session) {
  return !session || (session.status !== "moved" && session.status !== "cancelled")
}

/** The instant a class takes place: the schedule's time on its date, or the class's own `time`. */
export function instantOf(schedule, session) {
  return schedule.instantOn(session.date, session.time ?? null)
}

/**
 * The first class at or after `now`: the earliest of the active sessions and of the
 * schedule's regular occurrences whose date is not moved or cancelled.
 * @returns {{date: string, instant: Date, session: object|null}|null}
 */
export function nextClass({schedule, sessions, now = new Date()}) {
  return pick(candidates({schedule, sessions, now, direction: +1}), (t) => t >= now.getTime(), Math.min)
}

/** The last class strictly before `now`. */
export function lastClass({schedule, sessions, now = new Date()}) {
  return pick(candidates({schedule, sessions, now, direction: -1}), (t) => t < now.getTime(), Math.max)
}

/** The first active class strictly after the class on `date` (where a cancelled class's materials go). */
export function followingClass({schedule, sessions, date}) {
  if (!schedule) return null
  const byDate = new Map(sessions.map((s) => [s.date, s]))
  const after = schedule.instantOn(date, byDate.get(date)?.time ?? null).getTime()
  const all = candidates({schedule, sessions, now: new Date(after), direction: +1})
  return pick(all, (t) => t > after, Math.min)
}

/**
 * Classes that a NEW weekly rule must not touch: future active classes that
 * already have posts or files and no time of their own. They keep the old
 * rule's time explicitly, so the new rule cannot move them.
 * @returns {Array<{date: string, time: string, session: object}>} in date order
 */
export function pinnedSessions({schedule, sessions, now = new Date()}) {
  if (!schedule) return []
  // by instant, not by date: a class held earlier today is over and needs no pinning
  return sessions
    .filter((s) => isActive(s) && !s.time && (s.posts.length > 0 || s.files.length > 0) && schedule.instantOn(s.date, null).getTime() > now.getTime())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({date: s.date, time: schedule.time, session: s}))
}

/**
 * What differs from the weekly rule from `today` on, for "/schedule":
 * moved classes (with the new date and time), cancelled ones, and classes
 * that merely start at another time.
 * @returns {Array<{kind: "moved"|"cancelled"|"time", date: string, to?: string, time?: string|null}>}
 */
export function upcomingChanges({schedule, sessions, today}) {
  const byDate = new Map(sessions.map((s) => [s.date, s]))
  const changes = []
  for (const s of sessions) {
    if (s.status === "moved" && (s.date >= today || s.movedTo >= today)) changes.push({kind: "moved", date: s.date, to: s.movedTo, time: byDate.get(s.movedTo)?.time ?? schedule?.time ?? null})
    else if (s.status === "cancelled" && (s.date >= today || s.movedTo >= today)) changes.push({kind: "cancelled", date: s.date, to: s.movedTo})
    else if (isActive(s) && s.time && s.date >= today && !s.movedFrom) changes.push({kind: "time", date: s.date, time: s.time})
  }
  return changes.sort((a, b) => a.date.localeCompare(b.date))
}

function candidates({schedule, sessions, now, direction}) {
  const byDate = new Map(sessions.map((s) => [s.date, s]))
  const found = new Map() // date -> candidate
  for (const s of sessions) if (isActive(s) && schedule) found.set(s.date, {date: s.date, instant: instantOf(schedule, s), session: s})
  if (schedule) {
    let occurrence = direction > 0 ? schedule.nextOccurrence(now) : schedule.lastOccurrence(now)
    for (let week = 0; week < WEEKS_AHEAD; week++) {
      const date = schedule.localDate(occurrence)
      const session = byDate.get(date) ?? null
      if (isActive(session) && !found.has(date)) found.set(date, {date, instant: schedule.instantOn(date), session})
      occurrence = schedule.instantOn(addDays(date, 7 * direction))
    }
  }
  return [...found.values()]
}

function pick(candidates, accept, choose) {
  const fitting = candidates.filter((c) => accept(c.instant.getTime()))
  if (fitting.length === 0) return null
  const best = choose(...fitting.map((c) => c.instant.getTime()))
  return fitting.find((c) => c.instant.getTime() === best)
}

// ---- overviews for the "/занятие" section ----

export const ClassStatus = Object.freeze({NEXT: "next", PLANNED: "planned", PAST: "past", MOVED: "moved", CANCELLED: "cancelled"})

/** The calendar day of `now` in the schedule's zone (UTC without a schedule). */
function todayOf(schedule, now) {
  return schedule ? schedule.localDate(now) : now.toISOString().slice(0, 10)
}

/** The schedule's time on `date` unless the session overrides it; null without either. */
export function timeOf(schedule, session) {
  return session?.time ?? schedule?.time ?? null
}

/**
 * The status of the class on `date`: the calendar's next class, a planned or a
 * past one, or a moved / cancelled marker.
 */
export function classStatus({schedule, sessions, now, date, session = null}) {
  if (session?.status === "moved") return ClassStatus.MOVED
  if (session?.status === "cancelled") return ClassStatus.CANCELLED
  if (nextClass({schedule, sessions, now})?.date === date) return ClassStatus.NEXT
  return date > todayOf(schedule, now) ? ClassStatus.PLANNED : ClassStatus.PAST
}

/**
 * A class as the overviews show it. @returns {{date, time, session, status}}
 */
function item({schedule, sessions, now}, date, session) {
  return {date, time: timeOf(schedule, session), session, status: classStatus({schedule, sessions, now, date, session})}
}

/**
 * The next `count` classes (regular occurrences and recorded ones), earliest
 * first, with the moved / cancelled markers that fall inside that range.
 */
export function upcomingClasses({schedule, sessions, now, count = 3}) {
  const today = todayOf(schedule, now)
  const active = schedule
    ? candidates({schedule, sessions, now, direction: +1}).filter((c) => c.instant.getTime() >= now.getTime()).sort((a, b) => a.instant - b.instant)
    : sessions.filter((s) => isActive(s) && s.date >= today).map((s) => ({date: s.date, session: s}))
  return withMarkers(active.slice(0, count), sessions, {schedule, sessions, now}, (m, range) => m.date >= today && m.date <= range.at(-1).date)
}

/**
 * The last `count` recorded classes before today, latest first, with the
 * markers inside that range.
 */
export function recentClasses({schedule, sessions, now, count = 3}) {
  const today = todayOf(schedule, now)
  const next = nextClass({schedule, sessions, now})?.date
  // a class earlier today counts as recent too: the calendar's next class is the only one of today that does not
  const isOver = (s) => s.date < today || (s.date === today && s.date !== next && (!schedule || instantOf(schedule, s).getTime() < now.getTime()))
  const past = sessions.filter((s) => isActive(s) && isOver(s)).sort((a, b) => b.date.localeCompare(a.date))
  return withMarkers(past.slice(0, count).map((s) => ({date: s.date, session: s})), sessions, {schedule, sessions, now}, (m, range) => m.date <= today && m.date >= range.at(-1).date)
}

function withMarkers(active, sessions, context, inRange) {
  const items = active.map((c) => item(context, c.date, c.session ?? null))
  if (items.length === 0) return items
  for (const m of sessions) if (!isActive(m) && inRange(m, items) && !items.some((i) => i.date === m.date)) items.push(item(context, m.date, m))
  return items.sort((a, b) => (active[0].date <= active.at(-1).date ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)))
}

/**
 * Every class of one month: the recorded ones (markers included) and the
 * regular occurrences still ahead. @param {number} month 1-12
 */
export function classesInMonth({schedule, sessions, now, year, month}) {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`
  const byDate = new Map(sessions.filter((s) => s.date.startsWith(prefix)).map((s) => [s.date, s]))
  if (schedule) {
    const today = todayOf(schedule, now)
    for (let day = 1; day <= 31; day++) {
      const date = `${prefix}${String(day).padStart(2, "0")}`
      if (addDays(date, 0) !== date) continue // no such day in this month
      if (date >= today && weekdayOf(date) === schedule.weekday && !byDate.has(date)) byDate.set(date, null)
    }
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, session]) => item({schedule, sessions, now}, date, session))
}

/** Recorded (active) classes per month of a year: Map month(1-12) -> count. */
export function countByMonth(sessions, year) {
  const counts = new Map()
  for (const s of sessions) if (isActive(s) && s.date.startsWith(`${year}-`)) counts.set(Number(s.date.slice(5, 7)), (counts.get(Number(s.date.slice(5, 7))) ?? 0) + 1)
  return new Map([...counts.entries()].sort(([a], [b]) => a - b))
}

/** Recorded (active) classes per year: Map year -> count, latest year first. */
export function countByYear(sessions) {
  const counts = new Map()
  for (const s of sessions) if (isActive(s)) counts.set(Number(s.date.slice(0, 4)), (counts.get(Number(s.date.slice(0, 4))) ?? 0) + 1)
  return new Map([...counts.entries()].sort(([a], [b]) => b - a))
}

/**
 * Everything the card of one class shows: the date and time, the status, the
 * session's contents (may be absent for a regular date nobody posted for) and
 * the weekly rule. Pure data for the texts.
 */
export function classCard({schedule, sessions, now, date, session = null}) {
  return {
    date,
    time: timeOf(schedule, session),
    status: classStatus({schedule, sessions, now, date, session}),
    topic: session?.topic ?? null,
    posts: session?.posts ?? [],
    files: session?.files ?? [],
    movedFrom: session?.movedFrom ?? null,
    movedTo: session?.movedTo ?? null,
    schedule,
  }
}
