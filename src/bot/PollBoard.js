import {POLL_REACTIONS, PollStatus, castBallot, closingTime, optionOfReaction, rebuildBallots, tally} from "../domain/Poll.js"

/**
 * The group side of polls: publishes the single poll message, counts the
 * reactions members put on it, keeps the message's text current (edited, no
 * new messages), closes polls at their deadline - or, without one, after `idleDays`
 * days without a vote - and rebuilds the ballots from
 * the reactions the CLI knows after a restart. Timers are injectable.
 */
export class PollBoard {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("../storage/PollStore.js").PollStore} deps.polls
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   * @param {string} [deps.timezone] for the times in the message
   * @param {number} [deps.editDelayMs] reactions arriving within this window cause one edit
   * @param {number} [deps.idleDays] a poll without a deadline closes after this many days without a vote (0 = never)
   */
  constructor({gateway, polls, replies, logger, timezone = "UTC", clock = () => new Date(), setTimer = setTimeout, clearTimer = clearTimeout, editDelayMs = 2_000, maxWaitMs = 6 * 3_600_000, idleDays = 8}) {
    this.gateway = gateway
    this.polls = polls
    this.replies = replies
    this.logger = logger
    this.timezone = timezone
    this.clock = clock
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.editDelayMs = editDelayMs
    this.maxWaitMs = maxWaitMs
    this.idleDays = idleDays
    this.deadlineTimer = null
    this.editTimers = new Map() // poll id -> timer
  }

  /** After (re)connecting: catch up on reactions the bot missed, then plan the deadlines. */
  async start() {
    this.stop()
    for (const poll of this.polls.list().filter((p) => p.status === PollStatus.OPEN && p.itemId !== null)) {
      try {
        await this.#resync(poll)
      } catch (e) {
        this.logger.warn(`poll #${poll.id}: cannot re-read reactions: ${e.message}`)
      }
    }
    this.#plan()
  }

  stop() {
    if (this.deadlineTimer) this.clearTimer(this.deadlineTimer)
    this.deadlineTimer = null
    for (const t of this.editTimers.values()) this.clearTimer(t)
    this.editTimers.clear()
  }

  /** Posts the poll in its group and records the message. @returns the open poll */
  async publish(poll) {
    const opened = {...poll, status: PollStatus.OPEN, activeAt: this.clock().toISOString()}
    const itemId = await this.gateway.sendText(chatOf(opened), this.render(opened))
    opened.itemId = itemId
    this.polls.save(opened)
    this.logger.info(`poll #${opened.id} published in #${opened.group.name} by ${opened.author.name}`)
    this.#plan()
    return opened
  }

  /** A reaction on some message: a vote if the message is an open poll. */
  async onReaction({chat, itemId, sender, emoji, added}) {
    if (chat.type !== "group") return
    const poll = this.polls.findByPost(chat.id, itemId)
    if (!poll || poll.status !== PollStatus.OPEN) return
    const option = optionOfReaction(emoji)
    if (option < 0) return
    if (!castBallot(poll, memberKey(sender), sender.name, option, added, this.clock())) return
    this.polls.save(poll)
    this.logger.info(`poll #${poll.id}: ${sender.name} ${added ? "chose" : "withdrew"} option ${option + 1}`)
    this.#scheduleEdit(poll.id)
    if (!poll.closesAt) this.#plan() // a vote moves the idle closing
  }

  /** Ends a poll now (deadline, idleness, author or admin) and rewrites the message with the result. */
  async close(poll, status = PollStatus.CLOSED, closedBy = null) {
    const timer = this.editTimers.get(poll.id)
    if (timer) this.clearTimer(timer)
    this.editTimers.delete(poll.id)
    const ended = {...poll, status, closedAt: this.clock().toISOString(), ...(closedBy ? {closedBy, idleDays: poll.idleDays ?? this.idleDays} : {})}
    this.polls.save(ended)
    this.logger.info(`poll #${ended.id} ${status}`)
    await this.#edit(ended)
    this.#plan()
    return ended
  }

  render(poll) {
    return this.replies.pollPostText(poll, tally(poll), this.timezone)
  }

  #scheduleEdit(id) {
    const pending = this.editTimers.get(id)
    if (pending) this.clearTimer(pending)
    this.editTimers.set(
      id,
      this.setTimer(() => {
        this.editTimers.delete(id)
        const poll = this.polls.get(id)
        if (poll) this.#edit(poll).catch((e) => this.logger.warn(`poll #${id}: ${e.message}`))
      }, this.editDelayMs)
    )
  }

  async #edit(poll) {
    if (poll.itemId === null) return
    try {
      await this.gateway.editText(chatOf(poll), poll.itemId, this.render(poll))
    } catch (e) {
      this.logger.warn(`poll #${poll.id}: cannot update the message: ${e.message}`)
    }
  }

  async #resync(poll) {
    const reactions = []
    for (const [option] of poll.options.entries()) {
      const members = await this.gateway.reactionMembers(poll.group.id, poll.itemId, POLL_REACTIONS[option])
      reactions.push({option, members: members.map((m) => ({key: memberKey(m), name: m.name, at: m.at}))})
    }
    const before = JSON.stringify(poll.ballots)
    rebuildBallots(poll, reactions)
    if (JSON.stringify(poll.ballots) === before) return
    this.polls.save(poll)
    this.logger.info(`poll #${poll.id}: ballots rebuilt from the reactions (${Object.keys(poll.ballots).length} participant(s))`)
    await this.#edit(poll)
  }

  #plan() {
    if (this.deadlineTimer) this.clearTimer(this.deadlineTimer)
    this.deadlineTimer = null
    const open = this.polls.list().filter((p) => p.status === PollStatus.OPEN).map((p) => ({poll: p, at: closingTime(p, this.idleDays)})).filter((x) => x.at !== null)
    if (open.length === 0) return
    const now = this.clock().getTime()
    const due = open.filter((x) => x.at <= now)
    if (due.length > 0) {
      Promise.all(due.map(({poll: p}) => this.close(p, PollStatus.CLOSED, p.closesAt ? null : "idle"))).catch((e) => this.logger.error(`closing polls: ${e.message}`))
      return // close() plans again
    }
    const next = Math.min(...open.map((x) => x.at))
    this.deadlineTimer = this.setTimer(() => {
      this.deadlineTimer = null
      this.#plan()
    }, Math.min(next - now, this.maxWaitMs))
  }
}

const chatOf = (poll) => ({type: "group", id: poll.group.id, name: poll.group.name})
const memberKey = (who) => String(who.memberId ?? who.contactId ?? who.name)
