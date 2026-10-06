/**
 * Weekly class schedule: a weekday and a wall-clock time in a time zone.
 * Answers "when is the next class?" and "when was the last one?" as instants,
 * and names days in that zone ("YYYY-MM-DD"). No libraries: Intl does the
 * zone arithmetic. Pure value object.
 */
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
const WEEKDAY_WORDS = new Map([
  ...["вс", "воскресенье", "sun", "sunday"].map((w) => [w, 0]),
  ...["пн", "понедельник", "mon", "monday"].map((w) => [w, 1]),
  ...["вт", "вторник", "tue", "tuesday"].map((w) => [w, 2]),
  ...["ср", "среда", "среду", "wed", "wednesday"].map((w) => [w, 3]),
  ...["чт", "четверг", "thu", "thursday"].map((w) => [w, 4]),
  ...["пт", "пятница", "пятницу", "fri", "friday"].map((w) => [w, 5]),
  ...["сб", "суббота", "субботу", "sat", "saturday"].map((w) => [w, 6]),
])

/** "вт" / "пятницу" / "friday" -> 0..6 (Sunday = 0), or null */
export function parseWeekday(word) {
  return WEEKDAY_WORDS.get(String(word ?? "").toLowerCase()) ?? null
}

export class ClassSchedule {
  /** @param {{weekday: number, hour: number, minute: number, timezone?: string}} p weekday 0 = Sunday */
  constructor({weekday, hour, minute, timezone = "UTC"}) {
    this.weekday = weekday
    this.hour = hour
    this.minute = minute
    this.timezone = timezone
    this.format = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    })
    Object.freeze(this)
  }

  /** "вт 19:00", "tuesday 19.00", "tue 19:00" -> ClassSchedule, or null */
  static parse(text, timezone = "UTC") {
    const m = /^\s*([a-zа-яё]+)\s+(\d{1,2})[:.](\d{2})\s*$/iu.exec(String(text ?? ""))
    if (!m) return null
    const weekday = parseWeekday(m[1])
    const hour = Number(m[2])
    const minute = Number(m[3])
    if (weekday === null || hour > 23 || minute > 59) return null
    return new ClassSchedule({weekday, hour, minute, timezone})
  }

  static fromJSON(obj, timezone) {
    return obj ? new ClassSchedule({...obj, timezone: timezone ?? obj.timezone}) : null
  }

  toJSON() {
    return {weekday: this.weekday, hour: this.hour, minute: this.minute, timezone: this.timezone}
  }

  /** Wall-clock parts of an instant in the schedule's zone. */
  localParts(instant) {
    const parts = Object.fromEntries(this.format.formatToParts(instant).map((p) => [p.type, p.value]))
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      weekday: WEEKDAYS.indexOf(parts.weekday.toLowerCase()),
    }
  }

  /** "YYYY-MM-DD" of an instant in the schedule's zone. */
  localDate(instant) {
    return this.localParts(instant).date
  }

  /**
   * The instant of the class on a given local date, at the schedule's time or
   * at `time` ("hh:mm", a per-class override).
   */
  instantOn(ymd, time = null) {
    const {hour, minute} = time ? parseTime(time) : this
    const [y, m, d] = ymd.split("-").map(Number)
    let guess = Date.UTC(y, m - 1, d, hour, minute)
    for (let i = 0; i < 2; i++) {
      const p = this.localParts(new Date(guess))
      const seen = Date.UTC(...p.date.split("-").map(Number).map((v, k) => (k === 1 ? v - 1 : v)), p.hour, p.minute)
      const want = Date.UTC(y, m - 1, d, hour, minute)
      if (seen === want) break
      guess += want - seen
    }
    return new Date(guess)
  }

  /** "hh:mm" of the schedule's time. */
  get time() {
    return `${String(this.hour).padStart(2, "0")}:${String(this.minute).padStart(2, "0")}`
  }

  /** First class at or after `now`. */
  nextOccurrence(now = new Date()) {
    return this.#occurrence(now, +1, (t) => t.getTime() >= now.getTime())
  }

  /** Last class strictly before `now`. */
  lastOccurrence(now = new Date()) {
    return this.#occurrence(now, -1, (t) => t.getTime() < now.getTime())
  }

  #occurrence(now, direction, accept) {
    const today = this.localDate(now)
    for (let offset = 0; offset <= 7; offset++) {
      const date = addDays(today, offset * direction)
      if (weekdayOf(date) !== this.weekday) continue
      const t = this.instantOn(date)
      if (accept(t)) return t
    }
    return this.instantOn(addDays(today, 7 * direction)) // unreachable in practice
  }
}

/** "19:30" -> {hour: 19, minute: 30}, or null when not a valid time */
export function parseTime(text) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(text ?? ""))
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  return hour > 23 || minute > 59 ? null : {hour, minute}
}

export function weekdayOf(ymd) {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
