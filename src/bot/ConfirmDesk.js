import {CommandKind, parseCommand, resolveSection} from "../domain/Command.js"
import {parsePollCommand} from "../domain/Poll.js"

/**
 * "/подтвердить" and "/отменить" - one place for every previewed action:
 * a schedule change, a move or a cancellation of a class, a new poll or the
 * cancellation of a published one all wait in the same Confirmations, so the
 * member learns two words. The section forms ("/занятие подтвердить",
 * "/голосование отменить") mean the same and land here too.
 */
export class ConfirmDesk {
  /**
   * @param {object} deps
   * @param {import("../transport/SimplexClient.js").SimplexClient} deps.gateway
   * @param {import("./Confirmations.js").Confirmations} deps.confirmations
   * @param {{allows(sender): Promise<boolean>}} deps.access
   * @param {import("../i18n/en.js").en} deps.replies
   * @param {import("../util/logger.js").Logger} deps.logger
   */
  constructor({gateway, confirmations, access, replies, logger}) {
    this.gateway = gateway
    this.confirmations = confirmations
    this.access = access
    this.replies = replies
    this.logger = logger
  }

  /** @returns {Promise<boolean>} true if the message was a confirmation or a drop */
  async handle(message) {
    if (!message.isDirect || !message.incoming) return false
    const kind = confirmKind(message.text)
    if (!kind) return false
    const {chat, sender} = message
    if (!(await this.access.allows(sender))) {
      this.logger.info(`denied ${sender.name}: not a group member`)
      await this.gateway.sendText(chat, this.replies.deniedText())
      return true
    }
    this.logger.info(`${sender.name}: ${kind}`)
    if (kind === CommandKind.DROP) {
      await this.gateway.sendText(chat, this.confirmations.drop(sender) ? this.replies.confirmationDroppedText() : this.replies.nothingToDropText())
      return true
    }
    const run = this.confirmations.take(sender)
    if (!run) {
      await this.gateway.sendText(chat, this.replies.nothingToConfirmText())
      return true
    }
    const text = await run()
    if (text) await this.gateway.sendText(chat, text)
    return true
  }
}

/** CONFIRM / DROP for "/подтвердить", "/отменить" and the section forms, else null. */
function confirmKind(text) {
  const command = resolveSection(parseCommand(text))
  if (command.kind === CommandKind.CONFIRM || command.kind === CommandKind.DROP) return command.kind
  if (command.kind === CommandKind.VOTE) {
    const action = parsePollCommand(command.argument).action
    if (action === "confirm") return CommandKind.CONFIRM
    if (action === "drop") return CommandKind.DROP
  }
  return null
}
