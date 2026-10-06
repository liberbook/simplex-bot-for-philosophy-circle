/**
 * A poll ("голосование"): a question with options, published as one message in
 * a group; members vote with reactions, one emoji per option. Pure data and
 * rules - no I/O, no chat knowledge.
 *
 * Poll {id, question, options: string[], multiple, days: number|null, author: {contactId, name}, group: {id, name},
 *       status: "draft"|"open"|"closed"|"cancelled", createdAt, closesAt: string|null (null = no deadline:
 *       the author or an admin closes it), idleDays: number|null (a poll without a deadline closes
 *       after this many days without a vote), activeAt: string|null (published, or the last vote
 *       given or withdrawn), closedAt: string|null, closedBy?: "idle",
 *       itemId: number|null (the bot's message in the group),
 *       ballots: {[memberKey]: {name, choices: number[], at}}}
 */

/**
 * Reactions the CLI accepts (single code points; the heart is left out because
 * the apps send it with a variation selector the CLI rejects), neutral ones
 * first. An option's reaction is the one at its index.
 */
export const POLL_REACTIONS = Object.freeze(["👍", "😀", "😂", "🚀", "✅", "😢", "👎"])
export const PollStatus = Object.freeze({DRAFT: "draft", OPEN: "open", CLOSED: "closed", CANCELLED: "cancelled"})

const DAY_MS = 86_400_000
const SUBCOMMANDS = new Map([
  ...["подтвердить", "confirm"].map((w) => [w, "confirm"]),
  ...["отменить", "отмена", "о", "cancel"].map((w) => [w, "cancel"]),
  ...["закрыть", "з", "close"].map((w) => [w, "close"]),
  ...["история", "и", "history"].map((w) => [w, "history"]),
  ...["помощь", "help", "?"].map((w) => [w, "help"]),
])

/** Emoji as the apps send it (often with U+FE0F) -> the option index, or -1 */
export function optionOfReaction(emoji) {
  return POLL_REACTIONS.indexOf(String(emoji ?? "").replace(/️/gu, ""))
}

/**
 * Parses the text after "/голосование".
 * @returns {{action: "list"|"help"|"history"|"confirm"|"drop"} | {action: "cancel"|"close"|"show", id: number|null}
 *   | {action: "create", question, options, days: number|null, multiple, group: string|null} | {action: "error", code: string}}
 */
export function parsePollCommand(argument, {defaultDays = null, maxOptions = POLL_REACTIONS.length} = {}) {
  const text = String(argument ?? "").trim()
  if (!text) return {action: "list"}
  const [first, ...rest] = text.split(/\s+/)
  const sub = SUBCOMMANDS.get(first.toLowerCase())
  const id = rest[0] && /^\d+$/.test(rest[0]) ? Number(rest[0]) : null
  if (sub === "cancel") return id === null ? {action: "drop"} : {action: "cancel", id}
  if (sub === "close") return {action: "close", id}
  if (sub) return {action: sub}
  if (/^\d+$/.test(text)) return {action: "show", id: Number(text)}
  return parseCreate(text, defaultDays, maxOptions)
}

function parseCreate(text, defaultDays, maxOptions) {
  let days = defaultDays
  let multiple = false
  let group = null
  let body = text
  body = body.replace(/\s--?(?:дней|days)\s+(\S+)/giu, (_, n) => {
    days = /^\d+$/.test(n) ? Number(n) : NaN
    return " "
  })
  body = body.replace(/\s--?(?:несколько|multiple|multi)(?=\s|$)/giu, () => {
    multiple = true
    return " "
  })
  body = body.replace(/\s--?(?:группа|group)\s+(\S+)/giu, (_, g) => {
    group = g
    return " "
  })
  if (!body.includes("|")) return {action: "error", code: "noSeparator"}
  const parts = body.split("|").map((s) => s.replace(/\s+/g, " ").trim())
  const question = parts[0]
  const options = parts.slice(1).filter(Boolean)
  if (!question || options.length < 2) return {action: "error", code: "fewOptions"}
  if (options.length > maxOptions) return {action: "error", code: "tooManyOptions"}
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) return {action: "error", code: "badDays"}
  return {action: "create", question, options, days, multiple, group}
}

export function newPoll({question, options, days, multiple, author, group, idleDays = null, now = new Date()}) {
  return {
    id: null,
    question,
    options: [...options],
    multiple,
    days,
    author: {contactId: author.contactId, name: author.name},
    group: {id: group.id, name: group.title ?? group.name},
    status: PollStatus.DRAFT,
    createdAt: now.toISOString(),
    closesAt: days ? new Date(now.getTime() + days * DAY_MS).toISOString() : null,
    idleDays: days ? null : idleDays || null,
    activeAt: null,
    closedAt: null,
    itemId: null,
    ballots: {},
  }
}

/**
 * A member's reaction added or removed. Single-choice polls keep the last
 * active choice; multiple-choice polls keep every active reaction.
 * @returns {boolean} whether the ballots changed
 */
export function castBallot(poll, memberKey, name, optionIndex, added, now = new Date()) {
  if (optionIndex < 0 || optionIndex >= poll.options.length) return false
  const current = poll.ballots[memberKey]?.choices ?? []
  let choices
  if (added) choices = poll.multiple ? [...new Set([...current, optionIndex])] : [optionIndex]
  else choices = current.filter((c) => c !== optionIndex)
  if (choices.length === current.length && choices.every((c, i) => c === current[i])) return false
  if (choices.length === 0) delete poll.ballots[memberKey]
  else poll.ballots[memberKey] = {name, choices, at: now.toISOString()}
  poll.activeAt = now.toISOString()
  return true
}

/**
 * Rebuilds the ballots from who currently reacts with what (after the bot was
 * away). @param {Array<{option: number, members: Array<{key, name, at}>}>} reactions
 */
export function rebuildBallots(poll, reactions) {
  const latest = new Map() // key -> {name, choices: Map<option, at>}
  for (const {option, members} of reactions) {
    for (const m of members) {
      const entry = latest.get(m.key) ?? {name: m.name, choices: new Map()}
      entry.choices.set(option, m.at)
      latest.set(m.key, entry)
    }
  }
  poll.ballots = {}
  for (const [key, {name, choices}] of latest) {
    let picked = [...choices.entries()]
    if (!poll.multiple) picked = [picked.reduce((a, b) => (a[1] >= b[1] ? a : b))]
    poll.ballots[key] = {name, choices: picked.map(([o]) => o).sort((a, b) => a - b), at: picked.map(([, at]) => at).sort().at(-1)}
  }
  const lastVote = Object.values(poll.ballots).map((b) => b.at).filter(Boolean).sort().at(-1)
  if (lastVote && (!poll.activeAt || lastVote > poll.activeAt)) poll.activeAt = lastVote
}

/** @returns {{counts: number[], participants: number, leaders: number[]}} leaders: indexes with the top count (empty when nobody voted) */
export function tally(poll) {
  const counts = poll.options.map(() => 0)
  const ballots = Object.values(poll.ballots)
  for (const b of ballots) for (const c of b.choices) counts[c]++
  const top = Math.max(0, ...counts)
  return {counts, participants: ballots.length, leaders: top === 0 ? [] : counts.flatMap((c, i) => (c === top ? [i] : []))}
}

/**
 * When an open poll ends by itself: its deadline, or - without one - `idleDays` after the last
 * vote (or the publication). @param {number} [fallbackIdleDays] for polls created before the rule
 * @returns {number|null} epoch ms, null when only its author can end it
 */
export function closingTime(poll, fallbackIdleDays = 0) {
  if (poll.closesAt) return Date.parse(poll.closesAt)
  const idle = poll.idleDays ?? fallbackIdleDays
  if (!idle) return null
  return Date.parse(poll.activeAt ?? poll.createdAt) + idle * DAY_MS
}

export function isActive(poll) {
  return poll.status === PollStatus.OPEN
}
