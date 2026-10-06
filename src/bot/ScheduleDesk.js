import {ClassSchedule} from "../domain/ClassSchedule.js"
import {nextClass, pinnedSessions, upcomingChanges} from "../domain/ClassCalendar.js"

/**
 * The "/schedule [<weekday> <hh:mm>]" command: shows the weekly class schedule
 * (with the next class and the upcoming moves and cancellations) or previews a
 * new one, which takes effect once the same person sends "/confirm". Any member
 * may do both; checking membership is the caller's job. The group only ever
 * sees the short form (`brief`).
 */
export class ScheduleDesk {
  /**
   * @param {object} deps
   * @param {import("../storage/SessionStore.js").SessionStore} deps.sessions
   * @param {import("./Confirmations.js").Confirmations} deps.confirmations where the previewed change waits
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {string} [deps.timezone]
   * @param {{reschedule(): void}|null} [deps.reminder] re-planned when the schedule changes
   */
  constructor({sessions, confirmations, replies, logger, timezone = "UTC", reminder = null, clock = () => new Date()}) {
    this.sessions = sessions
    this.confirmations = confirmations
    this.reminder = reminder
    this.clock = clock
    this.replies = replies
    this.logger = logger
    this.timezone = timezone
  }

  /**
   * @param {string} argument "" to show, "<weekday> <hh:mm>" to preview a change
   * @param {{name: string, contactId?: number|null}} sender who asked
   * @returns {string} the reply text
   */
  respond(argument, sender) {
    if (!argument) return this.replies.scheduleShowText(this.sessions.getSchedule(), this.#outlook())
    const schedule = ClassSchedule.parse(argument, this.timezone)
    if (!schedule) return this.replies.scheduleUsageText()
    const pinned = this.#pinned()
    this.confirmations.ask(sender, () => this.#apply(schedule, sender.name))
    return this.replies.schedulePreviewText(schedule, this.#nextWith(schedule, pinned), pinned)
  }

  /** Future classes with materials keep the current rule's time when the rule changes (they are pinned). */
  #pinned() {
    return pinnedSessions({schedule: this.sessions.getSchedule(), sessions: this.sessions.list(), now: this.clock()})
  }

  /** The short form for the group: the weekly rule and the next class, nothing more; a change asked there is redirected. */
  brief({changeAsked = false} = {}) {
    const schedule = this.sessions.getSchedule()
    return this.replies.scheduleBriefText(schedule, schedule ? this.#outlook().next : null, changeAsked)
  }

  #apply(schedule, by) {
    const pinned = this.#pinned()
    const now = this.clock()
    for (const p of pinned) this.sessions.save({...p.session, time: p.time}, now) // the old time becomes the class's own
    this.sessions.setSchedule(schedule)
    this.reminder?.reschedule()
    this.logger.info(`schedule set by ${by}: ${this.replies.scheduleText(schedule)}${pinned.length > 0 ? `; kept as they were: ${pinned.map((p) => p.date).join(", ")}` : ""}`)
    return this.replies.scheduleSetText(schedule, this.#nextWith(schedule), pinned)
  }

  /**
   * The next class under a (possibly not yet applied) schedule; `pinned` classes are seen at their kept time.
   * @returns {{date, time, movedFrom}|null}
   */
  #nextWith(schedule, pinned = []) {
    const sessions = this.sessions.list().map((s) => pinned.find((p) => p.date === s.date) ? {...s, time: pinned.find((p) => p.date === s.date).time} : s)
    const next = nextClass({schedule, sessions, now: this.clock()})
    return next ? {date: next.date, time: next.session?.time ?? schedule.time, movedFrom: next.session?.movedFrom ?? null} : null
  }

  /** The next class and what differs from the weekly rule, for the reply. */
  #outlook() {
    const schedule = this.sessions.getSchedule()
    if (!schedule) return null
    return {next: this.#nextWith(schedule), changes: upcomingChanges({schedule, sessions: this.sessions.list(), today: schedule.localDate(this.clock())})}
  }
}
