import {CommandKind, parseCommand, resolveSection} from "../domain/Command.js"
import {parseDate, parseMonth, todayFor} from "../domain/Session.js"
import {weekdayOf} from "../domain/ClassSchedule.js"
import {classCard, classesInMonth, countByMonth, countByYear, isActive, nextClass, recentClasses, upcomingClasses} from "../domain/ClassCalendar.js"

const CLASS_COMMANDS = new Set([CommandKind.HOMEWORK, CommandKind.SESSIONS, CommandKind.CLASS_HELP, CommandKind.WATCH, CommandKind.SCHEDULE, CommandKind.MOVE, CommandKind.CANCEL])
const WATCH_ON = /^(вкл|on|да|yes)$/iu
const WATCH_OFF = /^(выкл|off|нет|no)$/iu
const ARCHIVE = /^(архив|archive)$/iu

/**
 * Private-chat side of the "/занятие" section: the card of one class, the
 * lists (overview, month, year, archive), the schedule, moving or cancelling a
 * class, the section's help, and subscribing to changes. Changes are previewed
 * by the desks and carried out by the ConfirmDesk on "/подтвердить".
 * Subject to the access policy like file commands.
 */
export class Syllabus {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("../storage/SessionStore.js").SessionStore} deps.sessions
   * @param {import("../storage/SubscriberStore.js").SubscriberStore} deps.subscribers
   * @param {{allows(sender): Promise<boolean>}} deps.access
   * @param {import("./ScheduleDesk.js").ScheduleDesk} deps.scheduleDesk
   * @param {import("./ClassDesk.js").ClassDesk} deps.classDesk
   * @param {import("./Listings.js").Listings} [deps.listings] the card's numbered files become the chat's "last list", so /д 1 fetches them
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   */
  constructor({gateway, sessions, subscribers, access, scheduleDesk, classDesk, listings = null, replies, logger, clock = () => new Date()}) {
    this.gateway = gateway
    this.sessions = sessions
    this.subscribers = subscribers
    this.access = access
    this.scheduleDesk = scheduleDesk
    this.classDesk = classDesk
    this.listings = listings
    this.replies = replies
    this.logger = logger
    this.clock = clock
  }

  /** @returns {Promise<boolean>} true if the message was a class command */
  async handle(message) {
    if (!message.isDirect || !message.incoming) return false
    const command = resolveSection(parseCommand(message.text))
    if (!CLASS_COMMANDS.has(command.kind)) return false
    const {chat, sender} = message
    if (!(await this.access.allows(sender))) {
      this.logger.info(`denied ${sender.name}: not a group member`)
      await this.gateway.sendText(chat, this.replies.deniedText())
      return true
    }
    this.logger.info(`${sender.name}: ${command.kind}${command.argument ? ` ${command.argument}` : ""}`)
    switch (command.kind) {
      case CommandKind.HOMEWORK:
        await this.#card(chat, command.argument)
        break
      case CommandKind.SESSIONS:
        await this.#list(chat, command.argument)
        break
      case CommandKind.CLASS_HELP:
        await this.gateway.sendText(chat, this.replies.classHelpText())
        break
      case CommandKind.WATCH:
        await this.#watch(chat, sender, command.argument)
        break
      case CommandKind.SCHEDULE:
        await this.gateway.sendText(chat, this.scheduleDesk.respond(command.argument, sender))
        break
      case CommandKind.MOVE:
        await this.classDesk.move(command.argument, sender, chat)
        break
      case CommandKind.CANCEL:
        await this.classDesk.cancel(command.argument, sender, chat)
        break
    }
    return true
  }

  /** "/уведомления" shows the state; "вкл" / "выкл" set it explicitly (no hidden toggle). */
  async #watch(chat, sender, argument) {
    const who = {contactId: sender.contactId, name: sender.name}
    if (WATCH_ON.test(argument)) this.subscribers.set(who, true)
    else if (WATCH_OFF.test(argument)) this.subscribers.set(who, false)
    else if (argument) return this.gateway.sendText(chat, this.replies.watchUsageText())
    await this.gateway.sendText(chat, this.replies.watchStatusText(this.subscribers.has(sender.contactId)))
  }

  /** "/занятие [date]": the card of the next class, or of the class on that date (a regular date without an entry counts). */
  async #card(chat, argument) {
    const schedule = this.sessions.getSchedule()
    const now = this.clock()
    const sessions = this.sessions.list()
    let date
    if (argument) {
      date = parseDate(argument, now, todayFor(schedule, now))
      if (!date) return this.gateway.sendText(chat, this.replies.sessionNotFoundText(argument))
    } else {
      date = nextClass({schedule, sessions, now})?.date ?? fallbackDate(sessions, todayFor(schedule, now))
      if (!date) return this.gateway.sendText(chat, this.replies.noSessionsText())
    }
    const session = this.sessions.get(date)
    if (!session && !(schedule && weekdayOf(date) === schedule.weekday)) return this.gateway.sendText(chat, this.replies.sessionNotFoundText(argument))
    const card = classCard({schedule, sessions, now, date, session})
    // the card numbers its files (readings first, then the recording) - the same order the text uses
    const numbered = [...card.files.filter((f) => f.kind !== "audio"), ...card.files.filter((f) => f.kind === "audio")].map((f) => f.name)
    if (numbered.length > 0) this.listings?.remember("archive", chat.id, numbered)
    await this.gateway.sendText(chat, this.replies.classCardText(card))
  }

  /** "/занятие список [month|year|архив]": the overview, one month, the months of a year, or the years. */
  async #list(chat, argument) {
    const schedule = this.sessions.getSchedule()
    const now = this.clock()
    const sessions = this.sessions.list()
    const t = this.replies
    if (!argument) {
      if (!schedule && sessions.filter(isActive).length === 0) return this.gateway.sendText(chat, t.noSessionsText())
      const today = todayFor(schedule, now)
      return this.gateway.sendText(chat, t.classesOverviewText({upcoming: upcomingClasses({schedule, sessions, now}), recent: recentClasses({schedule, sessions, now}), year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7))}))
    }
    if (ARCHIVE.test(argument)) return this.gateway.sendText(chat, t.classesArchiveText(countByYear(sessions)))
    if (/^\d{4}$/.test(argument)) return this.gateway.sendText(chat, t.classesYearText(Number(argument), countByMonth(sessions, Number(argument))))
    const month = parseMonth(argument, now)
    if (!month) return this.gateway.sendText(chat, t.classesUsageText(argument))
    await this.gateway.sendText(chat, t.classesMonthText({...month, items: classesInMonth({schedule, sessions, now, ...month})}))
  }
}

/** Without a schedule: the first recorded class from today on, else the most recent one. */
function fallbackDate(sessions, today) {
  const active = sessions.filter(isActive)
  return (active.find((s) => s.date >= today) ?? active.at(-1))?.date ?? null
}
