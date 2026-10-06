/**
 * Minimal glob support: only `*` and `?` are special, matching is anchored
 * and case-insensitive. Implemented as an iterative wildcard matcher (no
 * regular expressions): user-supplied patterns cannot make it backtrack
 * exponentially. Runs of `*` collapse and patterns are capped in length.
 */
const MAX_GLOB_LENGTH = 128

export function normalizeGlob(glob) {
  return String(glob ?? "")
    .toLowerCase()
    .slice(0, MAX_GLOB_LENGTH)
    .replace(/\*{2,}/g, "*")
}

/** @returns {(value: string) => boolean} */
export function globMatcher(glob) {
  const pattern = [...normalizeGlob(glob)]
  return (value) => wildcardMatch(pattern, [...String(value).toLowerCase()])
}

export function globMatches(glob, value) {
  return globMatcher(glob)(value)
}

/** Classic two-pointer wildcard match over code points: O(pattern * value) worst case. */
function wildcardMatch(p, s) {
  let pi = 0
  let si = 0
  let starP = -1
  let starS = 0
  while (si < s.length) {
    if (pi < p.length && (p[pi] === "?" || p[pi] === s[si])) {
      pi++
      si++
    } else if (pi < p.length && p[pi] === "*") {
      starP = pi++
      starS = si
    } else if (starP >= 0) {
      pi = starP + 1
      si = ++starS
    } else {
      return false
    }
  }
  while (pi < p.length && p[pi] === "*") pi++
  return pi === p.length
}
