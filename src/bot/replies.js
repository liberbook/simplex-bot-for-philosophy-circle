import {en} from "../i18n/en.js"
import {it} from "../i18n/it.js"
import {ru} from "../i18n/ru.js"
import {uk} from "../i18n/uk.js"

/**
 * The texts the bot sends, in one language. Pure functions: data in, string out.
 *
 * ADDING A LANGUAGE: copy src/i18n/en.js (the template - every other file has the
 * same keys), translate the values, then import it here and add it to the map.
 * Nothing else in the code names a language; test/unit/texts.test.js then checks
 * the new file for missing keys and for texts left in English.
 */
export const LANGUAGES = Object.freeze({en, ru, uk, it})

export const DEFAULT_LANGUAGE = "en"

/** ["en", "ru", "uk", "it"] - for the configuration and its error messages. */
export const LANGUAGE_CODES = Object.keys(LANGUAGES)

/**
 * @param {string} language a key of LANGUAGES
 * @param {{triggerWord?: string|null}} [context] the configured fetch word ("conatus"), quoted in the help texts
 */
export function createReplies(language = DEFAULT_LANGUAGE, {triggerWord = "conatus"} = {}) {
  const texts = LANGUAGES[language]
  if (!texts) throw new Error(`unsupported language "${language}" (available: ${Object.keys(LANGUAGES).join(", ")})`)
  return Object.assign(Object.create(texts), {triggerWord})
}
