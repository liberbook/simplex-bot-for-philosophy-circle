import {parseArgs} from "node:util"
import fs from "node:fs"
import path from "node:path"
import {parseSize} from "./util/format.js"
import {DEFAULT_LANGUAGE, LANGUAGE_CODES} from "./bot/replies.js"

/**
 * Configuration: defaults < config file (JSON) < environment < command line.
 * The result is a frozen plain object; nothing else reads argv/env/files.
 */
const DEFAULTS = Object.freeze({
  server: "ws://127.0.0.1:5225",
  dir: "./archive",
  deletedDir: "./deleted",
  deletedRetentionDays: 30,
  stateDir: "./state",
  group: "*",
  groupLinks: [],
  trigger: "conatus",
  scan: 100,
  membersOnly: true,
  maxStorage: "100gb",
  rateLimit: 20, // private messages per minute per contact; 0 = off
  adminSecret: "",
  adminGroupRoles: ["owner", "admin"],
  publicAddress: true,
  language: DEFAULT_LANGUAGE,
  timezone: "Europe/Moscow", // for the class schedule
  notifyDelaySeconds: 120, // quiet period before subscribers are told about class changes
  reminderMinutes: 30, // "the class starts in N minutes" in the group; 0 = off
  avatar: "data/avatar.png", // relative to the project folder; "" for none
  verbose: false,
})

// option -> [environment variable, kind]
const OPTIONS = {
  server: ["SPINOZA_SERVER", "string"],
  dir: ["SPINOZA_DIR", "string"],
  deletedDir: ["SPINOZA_DELETED_DIR", "string"],
  deletedRetentionDays: ["SPINOZA_DELETED_RETENTION_DAYS", "integer"],
  stateDir: ["SPINOZA_STATE_DIR", "string"],
  group: ["SPINOZA_GROUP", "string"],
  groupLinks: ["SPINOZA_GROUP_LINKS", "list"],
  trigger: ["SPINOZA_TRIGGER", "string"],
  scan: ["SPINOZA_SCAN", "integer"],
  membersOnly: ["SPINOZA_MEMBERS_ONLY", "boolean"],
  maxStorage: ["SPINOZA_MAX_STORAGE", "string"],
  rateLimit: ["SPINOZA_RATE_LIMIT", "integer"],
  adminSecret: ["SPINOZA_ADMIN_SECRET", "string"],
  adminGroupRoles: ["SPINOZA_ADMIN_GROUP_ROLES", "list"],
  publicAddress: ["SPINOZA_PUBLIC_ADDRESS", "boolean"],
  language: ["SPINOZA_LANGUAGE", "string"],
  timezone: ["SPINOZA_TIMEZONE", "string"],
  notifyDelaySeconds: ["SPINOZA_NOTIFY_DELAY_SECONDS", "integer"],
  reminderMinutes: ["SPINOZA_REMINDER_MINUTES", "integer"],
  avatar: ["SPINOZA_AVATAR", "string"],
  verbose: ["SPINOZA_VERBOSE", "boolean"],
}

const FLAGS = {
  config: {type: "string", short: "c"},
  server: {type: "string", short: "s"},
  dir: {type: "string", short: "d"},
  "deleted-dir": {type: "string"},
  "deleted-retention-days": {type: "string"},
  "state-dir": {type: "string"},
  group: {type: "string", short: "g"},
  "group-link": {type: "string", multiple: true},
  trigger: {type: "string", short: "t"},
  scan: {type: "string"},
  "members-only": {type: "boolean"},
  "max-storage": {type: "string"},
  "rate-limit": {type: "string"},
  "admin-secret": {type: "string"},
  "admin-group-roles": {type: "string"},
  "no-public-address": {type: "boolean"},
  language: {type: "string", short: "l"},
  timezone: {type: "string"},
  "notify-delay-seconds": {type: "string"},
  "reminder-minutes": {type: "string"},
  avatar: {type: "string"},
  verbose: {type: "boolean", short: "v"},
  help: {type: "boolean", short: "h"},
}

export const USAGE = `SimpleX file archive bot

Keeps the files shared in a group and serves them back in private chats.
The simplex-chat CLI must run as a WebSocket server, e.g.:
    simplex-chat -p 5225 -d ./db/chat --files-folder ./archive --temp-folder ./tmp \\
        --create-bot-display-name spinoza --create-bot-allow-files

Usage: node src/main.js [options]
Settings: defaults < config file (JSON) < environment variable < option.

  -c, --config <file>           JSON config file; default ./spinoza.json if present   [SPINOZA_CONFIG]
  -s, --server <url>            WebSocket URL of the CLI (ws://127.0.0.1:5225)        [SPINOZA_SERVER]
  -d, --dir <folder>            archive folder = CLI files folder (./archive)          [SPINOZA_DIR]
      --deleted-dir <folder>    where /delete moves files (./deleted)                 [SPINOZA_DELETED_DIR]
      --deleted-retention-days <N>  purge deleted files after N days, 0 = keep (30)   [SPINOZA_DELETED_RETENTION_DAYS]
      --state-dir <folder>      admins list, address/invite link (./state)            [SPINOZA_STATE_DIR]
  -g, --group <pattern>         group(s) to serve, glob allowed (*)                    [SPINOZA_GROUP]
      --group-link <link>       group link to join at start (repeatable)              [SPINOZA_GROUP_LINKS]
  -t, --trigger <word>          the word that sends a group file privately (conatus)    [SPINOZA_TRIGGER]
      --scan <N>                on start re-check last N group messages, 0=off (100)   [SPINOZA_SCAN]
      --members-only            serve files to members of the group only (default on;
                                SPINOZA_MEMBERS_ONLY=0 or "membersOnly": false to open)
      --max-storage <size>      archive size limit, e.g. 100gb, 500mb (100gb)          [SPINOZA_MAX_STORAGE]
      --rate-limit <N>          private messages per minute per contact, 0 = off (20)  [SPINOZA_RATE_LIMIT]
      --admin-secret <text>     users become admins with "/admin <text>" (none; without
                                it only group links and owner/admin roles apply)       [SPINOZA_ADMIN_SECRET]
      --admin-group-roles <l>   comma list of group roles that count as admins
                                (owner,admin); empty to disable                        [SPINOZA_ADMIN_GROUP_ROLES]
      --no-public-address       no public contact address; admins use /invite         [SPINOZA_PUBLIC_ADDRESS=0]
  -l, --language <code>         language of the bot's replies: ${LANGUAGE_CODES.join("|")} (${DEFAULT_LANGUAGE}) [SPINOZA_LANGUAGE]
      --timezone <tz>           time zone of the class schedule (Europe/Moscow)          [SPINOZA_TIMEZONE]
      --notify-delay-seconds <N> quiet period before class-change notifications (120)  [SPINOZA_NOTIFY_DELAY_SECONDS]
      --reminder-minutes <N>    remind the group N minutes before a class, 0 = off (30) [SPINOZA_REMINDER_MINUTES]
      --avatar <png|jpg>        profile picture (data/avatar.png); "" for none        [SPINOZA_AVATAR]
  -v, --verbose                 debug logging                                          [SPINOZA_VERBOSE]
  -h, --help
`

/**
 * @param {string[]} argv command line arguments (without node and script)
 * @param {NodeJS.ProcessEnv} env
 */
export function parseConfig(argv, env = {}) {
  const {values: flags} = parseArgs({args: argv, options: FLAGS})
  if (flags.help) return {help: true}

  const fromFile = readConfigFile(flags.config ?? env.SPINOZA_CONFIG ?? null)
  const fromEnv = Object.fromEntries(
    Object.entries(OPTIONS)
      .filter(([, [envName]]) => env[envName] !== undefined)
      .map(([key, [envName, kind]]) => [key, coerce(env[envName], kind, envName)])
  )
  const fromFlags = {
    server: flags.server,
    dir: flags.dir,
    deletedDir: flags["deleted-dir"],
    deletedRetentionDays: flags["deleted-retention-days"] === undefined ? undefined : coerce(flags["deleted-retention-days"], "integer", "--deleted-retention-days"),
    stateDir: flags["state-dir"],
    group: flags.group,
    groupLinks: flags["group-link"],
    trigger: flags.trigger,
    scan: flags.scan === undefined ? undefined : coerce(flags.scan, "integer", "--scan"),
    membersOnly: flags["members-only"],
    maxStorage: flags["max-storage"],
    rateLimit: flags["rate-limit"] === undefined ? undefined : coerce(flags["rate-limit"], "integer", "--rate-limit"),
    adminSecret: flags["admin-secret"],
    adminGroupRoles: flags["admin-group-roles"] === undefined ? undefined : coerce(flags["admin-group-roles"], "list", "--admin-group-roles"),
    publicAddress: flags["no-public-address"] ? false : undefined,
    language: flags.language,
    timezone: flags.timezone,
    notifyDelaySeconds: flags["notify-delay-seconds"] === undefined ? undefined : coerce(flags["notify-delay-seconds"], "integer", "--notify-delay-seconds"),
    reminderMinutes: flags["reminder-minutes"] === undefined ? undefined : coerce(flags["reminder-minutes"], "integer", "--reminder-minutes"),
    avatar: flags.avatar,
    verbose: flags.verbose,
  }

  const merged = {...DEFAULTS, ...defined(fromFile), ...defined(fromEnv), ...defined(fromFlags)}
  return validate(merged, env)
}

const PLACEHOLDER_SECRET = "change-me-to-a-long-random-secret"

function validate(c, env) {
  for (const key of ["scan", "deletedRetentionDays", "rateLimit", "notifyDelaySeconds", "reminderMinutes"]) {
    const n = typeof c[key] === "number" ? c[key] : coerce(c[key], "integer", key)
    if (!Number.isInteger(n) || n < 0) throw new Error(`${key} must be a non-negative integer`)
    c[key] = n
  }
  const notes = [] // settings that still work but changed meaning - logged at start-up
  let trigger = String(c.trigger).trim()
  if (trigger === "*") {
    trigger = "conatus"
    notes.push('trigger "*" is read as "conatus": every file is kept anyway, the trigger word only asks for one privately')
  }
  if (!trigger) throw new Error("trigger must not be empty")
  if (!/^[\p{L}\p{N}_-]+$/u.test(trigger)) throw new Error(`trigger must be one word ("${trigger}" given; every file is kept anyway - the word only asks for one privately)`)
  const language = String(c.language).trim().toLowerCase()
  if (!LANGUAGE_CODES.includes(language)) throw new Error(`unknown language "${c.language}" (available: ${LANGUAGE_CODES.join(", ")})`)
  try {
    new Intl.DateTimeFormat("en-US", {timeZone: String(c.timezone)})
  } catch {
    throw new Error(`unknown timezone "${c.timezone}" (use an IANA name such as Europe/Moscow)`)
  }
  if (String(c.adminSecret ?? "") === PLACEHOLDER_SECRET) throw new Error(`adminSecret still has the example value - set your own (e.g. the output of "openssl rand -hex 16")`)
  const roles = Array.isArray(c.adminGroupRoles) ? c.adminGroupRoles : coerce(c.adminGroupRoles, "list", "adminGroupRoles")
  const dir = path.resolve(expandHome(String(c.dir), env.HOME))
  const deletedDir = path.resolve(expandHome(String(c.deletedDir), env.HOME))
  if (deletedDir === dir) throw new Error("deletedDir must differ from dir")
  return Object.freeze({
    help: false,
    server: String(c.server),
    dir,
    deletedDir,
    deletedRetentionDays: c.deletedRetentionDays,
    stateDir: path.resolve(expandHome(String(c.stateDir), env.HOME)),
    group: String(c.group),
    groupLinks: Array.isArray(c.groupLinks) ? c.groupLinks.map(String) : coerce(c.groupLinks, "list", "groupLinks"),
    trigger,
    notes,
    scan: c.scan,
    membersOnly: Boolean(c.membersOnly),
    maxStorage: String(c.maxStorage),
    maxStorageBytes: parseSize(c.maxStorage),
    rateLimit: c.rateLimit,
    adminSecret: String(c.adminSecret ?? ""),
    adminGroupRoles: roles,
    publicAddress: Boolean(c.publicAddress),
    language,
    timezone: String(c.timezone),
    notifyDelaySeconds: c.notifyDelaySeconds,
    reminderMinutes: c.reminderMinutes,
    avatar: String(c.avatar ?? ""),
    verbose: Boolean(c.verbose),
  })
}

function readConfigFile(explicitPath) {
  const file = explicitPath ?? (fs.existsSync("spinoza.json") ? "spinoza.json" : null)
  if (!file) return {}
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (e) {
    throw new Error(`cannot read config file ${file}: ${e.message}`)
  }
  for (const key of Object.keys(parsed)) {
    if (!(key in OPTIONS)) throw new Error(`unknown setting "${key}" in ${file} (known: ${Object.keys(OPTIONS).join(", ")})`)
  }
  return parsed
}

function coerce(value, kind, what) {
  switch (kind) {
    case "integer": {
      const n = Number.parseInt(String(value), 10)
      if (!Number.isInteger(n)) throw new Error(`${what} must be an integer`)
      return n
    }
    case "boolean":
      return typeof value === "boolean" ? value : !["", "0", "false", "no", "off"].includes(String(value).toLowerCase())
    case "list":
      return Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim()).filter(Boolean)
    default:
      return String(value)
  }
}

function defined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

function expandHome(p, home) {
  return home && p.startsWith("~/") ? path.join(home, p.slice(2)) : p
}
