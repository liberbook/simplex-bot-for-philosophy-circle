import crypto from "node:crypto"
import {isActiveMemberStatus} from "../domain/membership.js"

/**
 * Who is an administrator of the bot:
 *  - contacts that proved knowledge of the admin secret (AdminRegistry), and
 *  - optionally, members holding one of `groupRoles` (e.g. owner/admin) in a
 *    watched group.
 * Only admins may add the bot to a group; without a secret the bot can still
 * be pointed at groups through configured group links.
 */
export class AdminPolicy {
  /**
   * @param {object} deps
   * @param {import("../storage/AdminRegistry.js").AdminRegistry} deps.registry
   * @param {{listMembers(groupId: number): Promise<{contactId: number|null, status: string, role: string}[]>}} deps.gateway
   * @param {import("./WatchedGroups.js").WatchedGroups} deps.groups
   * @param {string[]} [deps.groupRoles] group roles that count as bot admins
   * @param {string} [deps.secret] admin secret; empty disables promotion
   */
  constructor({registry, gateway, groups, groupRoles = [], secret = ""}) {
    this.registry = registry
    this.gateway = gateway
    this.groups = groups
    this.groupRoles = groupRoles
    this.secret = secret
  }

  async isAdmin(sender) {
    if (sender.contactId == null) return false
    if (this.registry.has(sender.contactId)) return true
    if (this.groupRoles.length === 0) return false
    for (const group of await this.groups.list()) {
      const members = await this.gateway.listMembers(group.id)
      if (members.some((m) => m.contactId === sender.contactId && isActiveMemberStatus(m.status) && this.groupRoles.includes(m.role))) return true
    }
    return false
  }

  /** Attempts to make `contact` an admin with the given secret. */
  promote(contact, secret) {
    if (!this.secret) return "disabled"
    if (!sameSecret(secret ?? "", this.secret)) return "wrong-secret"
    return this.registry.add(contact) ? "granted" : "already"
  }

  /** Only admins may add the bot to groups (a stranger's group must never make its owner a bot admin). */
  mayInvite(contact) {
    return this.isAdmin(contact)
  }

  describe() {
    const parts = [this.secret ? "by secret" : "no secret configured"]
    if (this.groupRoles.length > 0) parts.push(`group ${this.groupRoles.join("/")}`)
    return `admins: ${parts.join(" + ")}`
  }
}

function sameSecret(given, expected) {
  const a = Buffer.from(String(given))
  const b = Buffer.from(String(expected))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
