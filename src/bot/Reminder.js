import {nextClass} from "../domain/ClassCalendar.js"
import {newSession} from "../domain/Session.js"

/**
 * Posts "the class starts in N minutes" to every served group, once per
 * class. Plans from the schedule and the per-class exceptions; re-planned
 * whenever they change. Timers and the clock are injectable for tests; a
 * timer never waits longer than `maxWaitMs`, then the plan is re-checked.
 */
export class Reminder {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("./WatchedGroups.js").WatchedGroups} deps.groups
   * @param {import("../storage/SessionStore.js").SessionStore} deps.sessions
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {number} deps.leadMs how long before the class; 0 disables reminders
   */
  constructor({gateway, groups, sessions, replies, logger, leadMs, clock = () => new Date(), setTimer = setTimeout, clearTimer = clearTimeout, maxWaitMs = 6 * 3_600_000}) {
    this.gateway = gateway
    this.groups = groups
    this.sessions = sessions
    this.replies = replies
    this.logger = logger
    this.leadMs = leadMs
    this.clock = clock
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.maxWaitMs = maxWaitMs
    this.timer = null
  }

  start() {
    this.reschedule()
  }

  /** The schedule or a class changed: plan again from scratch. */
  reschedule() {
    this.stop()
    if (this.leadMs > 0) this.#plan()
  }

  stop() {
    if (this.timer) this.clearTimer(this.timer)
    this.timer = null
  }

  describe() {
    return this.leadMs > 0 ? `reminder ${Math.round(this.leadMs / 60_000)} min before a class` : "no reminders"
  }

  #plan() {
    const schedule = this.sessions.getSchedule()
    if (!schedule) return
    const now = this.clock()
    const sessions = this.sessions.list()
    let next = nextClass({schedule, sessions, now})
    while (next?.session?.remindedAt) next = nextClass({schedule, sessions, now: new Date(next.instant.getTime() + 1)}) // already reminded (e.g. restarted inside the window)
    if (!next) return
    const wait = next.instant.getTime() - this.leadMs - now.getTime()
    if (wait <= 0) {
      this.#fire(next).catch((e) => this.logger.error(`reminder: ${e.message}`))
      return
    }
    this.timer = this.setTimer(() => {
      this.timer = null
      this.#plan()
    }, Math.min(wait, this.maxWaitMs))
  }

  async #fire(next) {
    const now = this.clock()
    const session = next.session ?? newSession(next.date, now)
    session.remindedAt = now.toISOString()
    this.sessions.save(session, now)
    const text = this.replies.reminderText(Math.round(this.leadMs / 60_000), session.topic ?? null)
    for (const group of await this.groups.list()) {
      try {
        await this.gateway.sendText(group, text)
      } catch (e) {
        this.logger.warn(`cannot remind #${group.name}: ${e.message}`)
      }
    }
    this.logger.info(`reminded about class ${next.date}`)
    this.#plan()
  }
}
