import {parseDate, newSession, SessionStatus, todayFor} from "../domain/Session.js"
import {parseTime, weekdayOf} from "../domain/ClassSchedule.js"
import {followingClass, isActive, nextClass} from "../domain/ClassCalendar.js"

/**
 * "/move" and "/cancel" - private-chat commands (Syllabus). Both show what
 * would change and wait for "/confirm" from the same person (Confirmations):
 * moving relocates the next class to another date and/or time; cancelling
 * hands the class's homework and files to the following class. The files are
 * references into the flat archive, so nothing moves on disk; the result is
 * announced in every served group.
 * Checking membership is the caller's job.
 */
export class ClassDesk {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("./WatchedGroups.js").WatchedGroups} deps.groups
   * @param {import("../storage/SessionStore.js").SessionStore} deps.sessions
   * @param {import("./Notifier.js").Notifier} deps.notifier
   * @param {import("./Confirmations.js").Confirmations} deps.confirmations where previewed actions wait
   * @param {{reschedule(): void}|null} [deps.reminder]
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {() => Date} [deps.clock]
   */
  constructor({gateway, groups, sessions, notifier, confirmations, reminder = null, replies, logger, clock = () => new Date()}) {
    this.gateway = gateway
    this.groups = groups
    this.sessions = sessions
    this.notifier = notifier
    this.confirmations = confirmations
    this.reminder = reminder
    this.replies = replies
    this.logger = logger
    this.clock = clock
  }

  /**
   * "/move <date> [hh:mm]" or "/move <hh:mm>": previews the move of the next
   * class and waits for the confirmation.
   * @param {{name: string, memberId?: number, contactId?: number|null}} sender
   */
  async move(argument, sender, chat) {
    const schedule = this.sessions.getSchedule()
    if (!schedule) return this.gateway.sendText(chat, this.replies.scheduleShowText(null))
    const now = this.clock()
    const wanted = parseMove(argument, now, todayFor(schedule, now))
    if (!wanted) return this.gateway.sendText(chat, this.replies.moveUsageText())
    const next = nextClass({schedule, sessions: this.sessions.list(), now})
    if (!next) return this.gateway.sendText(chat, this.replies.noNextClassText())
    const from = next.date
    const to = wanted.date ?? from
    const fromTime = next.session?.time ?? schedule.time
    const time = wanted.time ?? fromTime
    if (to === from && time === fromTime) return this.gateway.sendText(chat, this.replies.moveNoChangeText(from, time))
    const items = (next.session?.posts.length ?? 0) + (next.session?.files.length ?? 0)
    this.confirmations.ask(sender, () => this.#move(from, to, time, sender.name, chat))
    await this.gateway.sendText(chat, this.replies.movePreviewText(from, fromTime, to, time, items))
  }

  /** "/cancel [date]": previews what a cancellation would do and waits for the confirmation. */
  async cancel(argument, sender, chat) {
    const schedule = this.sessions.getSchedule()
    if (!schedule) return this.gateway.sendText(chat, this.replies.scheduleShowText(null))
    const now = this.clock()
    const explicit = argument ? parseDate(argument, now, todayFor(schedule, now)) : null
    if (argument && !explicit) return this.gateway.sendText(chat, this.replies.cancelUsageText())
    const all = this.sessions.list()
    let target
    if (explicit) {
      target = this.sessions.get(explicit) ?? newSession(explicit, now)
      if (!isActive(target)) return this.gateway.sendText(chat, this.replies.classAlreadyCancelledText(explicit))
    } else {
      const next = nextClass({schedule, sessions: all, now})
      if (!next) return this.gateway.sendText(chat, this.replies.noNextClassText())
      target = next.session ?? newSession(next.date, now)
    }
    const following = followingClass({schedule, sessions: all, date: target.date})
    this.confirmations.ask(sender, () => this.#cancel(target.date, sender.name, chat))
    await this.gateway.sendText(chat, this.replies.cancelConfirmText(target.date, target.time ?? schedule.time, following.date, following.session?.time ?? schedule.time, target.posts.length + target.files.length))
  }

  /** The confirmed move. */
  async #move(from, to, time, by, chat) {
    const schedule = this.sessions.getSchedule()
    const now = this.clock()
    let session = this.sessions.get(from) ?? newSession(from, now)
    if (!isActive(session)) return this.gateway.sendText(chat, this.replies.classAlreadyCancelledText(from))
    if (to !== from) session = this.#relocate(session, to, SessionStatus.MOVED)
    session.time = time === schedule.time ? null : time
    session.remindedAt = null
    this.sessions.save(session, now)
    this.reminder?.reschedule()
    this.notifier.changed(to, {kind: "moved", by, from})
    this.logger.info(`class ${from} moved to ${to} ${time} by ${by}`)
    await this.#announce(chat, this.replies.classMovedText(from, to, time))
  }

  /** The confirmed cancellation: the class's homework and files go to the following class. */
  async #cancel(date, by, chat) {
    const now = this.clock()
    const target = this.sessions.get(date) ?? newSession(date, now)
    if (!isActive(target)) return this.gateway.sendText(chat, this.replies.classAlreadyCancelledText(date))
    const following = followingClass({schedule: this.sessions.getSchedule(), sessions: this.sessions.list(), date})
    this.#relocate(target, following.date, SessionStatus.CANCELLED)
    this.reminder?.reschedule()
    this.notifier.changed(following.date, {kind: "cancelled", by, from: date})
    this.logger.info(`class ${date} cancelled by ${by}; materials moved to ${following.date}`)
    await this.#announce(chat, this.replies.classCancelledText(date, following.date))
  }

  /**
   * Hands a class's posts and file references to the class on `to` (created if
   * needed) and leaves a marker on the old date so the calendar skips it.
   * @returns {object} the session on `to`
   */
  #relocate(session, to, status) {
    const now = this.clock()
    const target = this.sessions.get(to) ?? newSession(to, now)
    for (const post of session.posts) if (!target.posts.some((p) => p.itemId === post.itemId && p.groupId === post.groupId)) target.posts.push(post)
    for (const file of session.files) if (!target.files.some((f) => f.name === file.name)) target.files.push(file)
    for (const file of session.deletedFiles) if (!target.deletedFiles.some((f) => f.name === file.name)) target.deletedFiles.push(file)
    target.topic ??= session.topic
    target.status = SessionStatus.PLANNED
    target.movedTo = null
    if (status === SessionStatus.MOVED) target.movedFrom = session.movedFrom ?? session.date
    this.sessions.save(target, now)
    // a regular date of the schedule keeps a marker; a date the class had been moved to is simply forgotten
    if (weekdayOf(session.date) === this.sessions.getSchedule().weekday) this.sessions.save({...session, posts: [], files: [], deletedFiles: [], time: null, status, movedTo: to, remindedAt: null}, now)
    else this.sessions.remove(session.date)
    for (const marker of this.sessions.list()) if (marker.movedTo === session.date) this.sessions.save({...marker, movedTo: to}, now) // earlier markers follow
    return target
  }

  /** Tells every served group; a private caller hears the same text and where it was announced. */
  async #announce(chat, text) {
    const groups = await this.groups.list()
    for (const group of groups) await this.gateway.sendText(group, text)
    if (chat.type === "direct") await this.gateway.sendText(chat, groups.length > 0 ? this.replies.announcedText(text, groups.map((g) => g.title ?? g.name)) : text)
  }
}

/** "22.09 20:30" | "завтра" | "в пятницу 20:30" | "20:30" -> {date, time: "hh:mm"|null}; null when neither is there */
function parseMove(argument, now, today) {
  const date = parseDate(argument, now, today)
  const timeMatch = /(?<!\d)(\d{1,2}:\d{2})(?!\d)/.exec(argument ?? "")
  const parsed = timeMatch ? parseTime(timeMatch[1]) : null
  if (timeMatch && !parsed) return null
  if (!date && !parsed) return null
  return {date, time: parsed ? `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}` : null}
}
