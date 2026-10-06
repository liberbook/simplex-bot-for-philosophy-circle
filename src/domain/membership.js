/** Group member statuses meaning "not (or no longer) a real member". */
const INACTIVE_MEMBER_STATUSES = new Set(["rejected", "removed", "left", "deleted", "unknown", "invited", "pending_approval", "pending_review"])

export function isActiveMemberStatus(status) {
  return !INACTIVE_MEMBER_STATUSES.has(status)
}
