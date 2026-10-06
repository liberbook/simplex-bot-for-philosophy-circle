/**
 * Layout helpers shared by the language files: they shape lists, never words.
 */

/**
 * Renders items into lines while they fit into `maxChars` (a chat message has a
 * practical size limit). @returns {{lines: string[], shown: number}}
 */
export function fitLines(items, maxChars, render, used = 0) {
  const lines = []
  let length = used
  for (const [i, item] of items.entries()) {
    const line = render(item, i + 1)
    if (length + line.length + 1 > maxChars) break
    lines.push(line)
    length += line.length + 1
  }
  return {lines, shown: lines.length}
}

/**
 * A file's name as shown in lists: cut to `maxLength` characters keeping the
 * extension so the type stays visible: "Access to Arasaka - l a k e s - 01
 * EL54…flac". The stored name is untouched.
 */
export function shortFileName(name, maxLength = 42) {
  if (name.length <= maxLength) return name
  const dot = name.lastIndexOf(".")
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot + 1) : ""
  return `${stem.slice(0, maxLength - 2).trimEnd()}…${ext}`
}
