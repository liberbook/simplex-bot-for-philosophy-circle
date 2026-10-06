import {isActiveMemberStatus} from "../domain/membership.js"

/**
 * Who may list and download archived files in a private chat.
 * Interface: allows(sender) -> Promise<boolean>, describe() -> string
 */

/** Anyone who connected to the bot. */
export class OpenAccess {
  async allows() {
    return true
  }

  describe() {
    return "anyone connected to the bot"
  }
}

/** Only current members of the watched group(s). */
export class GroupMembersOnly {
  /**
   * @param {{listMembers(groupId: number): Promise<{contactId: number|null, status: string}[]>}} gateway
   * @param {import("./WatchedGroups.js").WatchedGroups} groups
   */
  constructor(gateway, groups) {
    this.gateway = gateway
    this.groups = groups
  }

  async allows(sender) {
    if (sender.contactId == null) return false
    for (const group of await this.groups.list()) {
      const members = await this.gateway.listMembers(group.id)
      if (members.some((m) => m.contactId === sender.contactId && isActiveMemberStatus(m.status))) return true
    }
    return false
  }

  describe() {
    return "members of the watched group only"
  }
}
