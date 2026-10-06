import {CommandKind, parseCommand} from "../domain/Command.js"
import {PollStatus, closingTime, newPoll, parsePollCommand, tally} from "../domain/Poll.js"

/**
 * Private-chat side of polls: "/голосование ...". A poll is drafted with one
 * command, shown as a preview and published by the PollBoard only after
 * "/подтвердить" (ConfirmDesk runs the action waiting in Confirmations); the
 * author (or an admin) can close or cancel it, a cancellation is previewed the
 * same way. Subject to the access policy like the other member commands.
 */
export class PollDesk {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("../storage/PollStore.js").PollStore} deps.polls
   * @param {import("./PollBoard.js").PollBoard} deps.board
   * @param {import("./WatchedGroups.js").WatchedGroups} deps.groups
   * @param {import("./Confirmations.js").Confirmations} deps.confirmations where previews wait for /подтвердить
   * @param {{allows(sender): Promise<boolean>}} deps.access
   * @param {{isAdmin(sender): Promise<boolean>}} deps.admins
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {number} [deps.maxActive] open polls one person may have
   * @param {number|null} [deps.defaultDays] a poll's duration when none is given; null = no deadline
   */
  constructor({gateway, polls, board, groups, confirmations, access, admins, replies, logger, timezone = "UTC", clock = () => new Date(), maxActive = 3, defaultDays = null}) {
    this.gateway = gateway
    this.polls = polls
    this.board = board
    this.groups = groups
    this.confirmations = confirmations
    this.access = access
    this.admins = admins
    this.replies = replies
    this.logger = logger
    this.timezone = timezone
    this.clock = clock
    this.maxActive = maxActive
    this.defaultDays = defaultDays
  }

  /** @returns {Promise<boolean>} true if the message was a poll command */
  async handle(message) {
    if (!message.isDirect || !message.incoming) return false
    const command = parseCommand(message.text)
    if (command.kind !== CommandKind.VOTE) return false
    const {chat, sender} = message
    if (!(await this.access.allows(sender))) {
      this.logger.info(`denied ${sender.name}: not a group member`)
      await this.gateway.sendText(chat, this.replies.deniedText())
      return true
    }
    const request = parsePollCommand(command.argument, {defaultDays: this.defaultDays})
    if (request.action === "confirm" || request.action === "drop") return false // the ConfirmDesk's words
    this.logger.info(`${sender.name}: poll ${request.action}${request.id ? ` ${request.id}` : ""}`)
    const t = this.replies
    switch (request.action) {
      case "list": {
        const mine = this.#mine(sender).filter((p) => p.status === PollStatus.OPEN)
        return this.#say(chat, mine.length > 0 ? t.pollListText(mine.map((p) => ({poll: p, tally: tally(p), closesOn: closingTime(p, this.board.idleDays)})), this.timezone) : t.pollNoActiveText())
      }
      case "help":
        return this.#say(chat, t.pollHelpText())
      case "history": {
        const past = this.#mine(sender).filter((p) => p.status !== PollStatus.OPEN)
        return this.#say(chat, t.pollHistoryText(past.map((p) => ({poll: p, tally: tally(p)})), this.timezone))
      }
      case "error":
        return this.#say(chat, t.pollErrorText(request.code))
      case "create":
        return this.#draft(chat, sender, request)
      case "cancel":
        return this.#askCancel(chat, sender, request.id)
      case "show": {
        const poll = this.polls.get(request.id)
        return this.#say(chat, poll ? t.pollShowText(poll, tally(poll), this.timezone) : t.pollNotFoundText(request.id))
      }
      case "close":
        return this.#close(chat, sender, request.id)
    }
    return true
  }

  async #draft(chat, sender, request) {
    const group = await this.#group(request.group)
    if (group.error) return this.#say(chat, group.error)
    const active = this.#mine(sender).filter((p) => p.status === PollStatus.OPEN).length
    if (active >= this.maxActive) return this.#say(chat, this.replies.pollLimitText(this.maxActive))
    const poll = newPoll({...request, author: sender, group: group.group, idleDays: this.board.idleDays, now: this.clock()})
    this.confirmations.ask(sender, () => this.#publish(poll))
    return this.#say(chat, this.replies.pollPreviewText(poll, this.timezone))
  }

  /** The confirmed draft goes to the group. @returns {Promise<string>} the answer for the author */
  async #publish(poll) {
    const stored = this.polls.add(poll)
    const open = await this.board.publish(stored)
    return this.replies.pollPublishedText(open)
  }

  async #askCancel(chat, sender, id) {
    const poll = await this.#manageable(chat, sender, id)
    if (!poll) return
    this.confirmations.ask(sender, () => this.#cancel(id))
    return this.#say(chat, this.replies.pollCancelConfirmText(poll))
  }

  /** The confirmed cancellation of a published poll. @returns {Promise<string>} */
  async #cancel(id) {
    const poll = this.polls.get(id)
    if (!poll || poll.status !== PollStatus.OPEN) return this.replies.pollNotOpenText(id)
    await this.board.close(poll, PollStatus.CANCELLED)
    return this.replies.pollCancelledText(poll)
  }

  async #close(chat, sender, id) {
    if (id === null) return this.#say(chat, this.replies.pollHelpText())
    const poll = await this.#manageable(chat, sender, id)
    if (!poll) return
    const closed = await this.board.close(poll)
    return this.#say(chat, this.replies.pollClosedText(closed, tally(closed), this.timezone))
  }

  /** An open poll the sender may manage (their own, or any as an admin), else a reply explaining why not. */
  async #manageable(chat, sender, id) {
    const poll = this.polls.get(id)
    if (!poll) {
      await this.#say(chat, this.replies.pollNotFoundText(id))
      return null
    }
    if (poll.status !== PollStatus.OPEN) {
      await this.#say(chat, this.replies.pollNotOpenText(id))
      return null
    }
    if (poll.author.contactId !== sender.contactId && !(await this.admins.isAdmin(sender))) {
      await this.#say(chat, this.replies.pollNotYoursText(id))
      return null
    }
    return poll
  }

  /** The group a poll goes to: the only served group, or the one named with --группа. */
  async #group(name) {
    const served = await this.groups.list()
    if (served.length === 0) return {error: this.replies.pollNoGroupText()}
    if (name) {
      const wanted = name.toLowerCase()
      const found = served.find((g) => g.name.toLowerCase() === wanted || (g.title ?? "").toLowerCase() === wanted)
      return found ? {group: found} : {error: this.replies.pollGroupUnknownText(name, served.map((g) => g.title ?? g.name))}
    }
    if (served.length > 1) return {error: this.replies.pollGroupAmbiguousText(served.map((g) => g.title ?? g.name))}
    return {group: served[0]}
  }

  #mine(sender) {
    return this.polls.list().filter((p) => p.author.contactId === sender.contactId)
  }

  async #say(chat, text) {
    await this.gateway.sendText(chat, text)
    return true
  }
}
