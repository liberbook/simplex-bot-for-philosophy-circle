/**
 * Hides the argument of the admin command wherever it may appear in a log
 * line: plain text ("/admin s3cret"), the slash-less form, the Russian alias,
 * and JSON-encoded chat items ("text":"/admin s3cret"). The command word must
 * start the text or follow a slash or a quote, so prose like "requested admin
 * access" is left alone. Everything after the command word up to the end of
 * the line, a quote or a backslash is replaced.
 */
const SECRET_ARGUMENT = /((?:^|["/])(?:admin|админ)\s+)[^"\\\n]+/giu

export function redactSecrets(text) {
  return String(text).replace(SECRET_ARGUMENT, "$1***")
}
