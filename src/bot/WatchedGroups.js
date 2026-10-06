import {globMatches} from "../util/glob.js"
import {isActiveMemberStatus} from "../domain/membership.js"

/** Which groups the bot serves: a name pattern, resolved to group refs on demand. */
export class WatchedGroups {
  /**
   * @param {{listGroups(): Promise<{id: number, name: string}[]>}} gateway
   * @param {string} pattern group name glob, e.g. "filedrop" or "*"
   */
  constructor(gateway, pattern) {
    this.gateway = gateway
    this.pattern = pattern
  }

  /** @param {{name: string, title?: string}} group matches the local name or the group's own title */
  matches(group) {
    return globMatches(this.pattern, group.name) || (group.title !== undefined && globMatches(this.pattern, group.title))
  }

  /** Groups matching the pattern that the bot has actually joined (not merely been invited to). */
  async list() {
    return (await this.gateway.listGroups()).filter((g) => this.matches(g) && isActiveMemberStatus(g.memberStatus))
  }
}
