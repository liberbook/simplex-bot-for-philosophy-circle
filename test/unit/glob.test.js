import test from "node:test"
import assert from "node:assert/strict"
import {globMatcher, globMatches, normalizeGlob} from "../../src/util/glob.js"

test("literal, star and question mark, anchored and case-insensitive", () => {
  assert.equal(globMatches("report.pdf", "REPORT.PDF"), true)
  assert.equal(globMatches("*.pdf", "a.pdf"), true)
  assert.equal(globMatches("*.pdf", "a.pdf.bak"), false)
  assert.equal(globMatches("scan-*.jpg", "scan-001.jpg"), true)
  assert.equal(globMatches("scan-?.jpg", "scan-01.jpg"), false)
  assert.equal(globMatches("*", ""), true)
  assert.equal(globMatches("", ""), true)
  assert.equal(globMatches("", "x"), false)
  assert.equal(globMatches("a*b*c", "aXXbYYc"), true)
  assert.equal(globMatches("a*b*c", "aXXbYY"), false)
})

test("question mark matches one code point, including Cyrillic and emoji", () => {
  assert.equal(globMatches("отч?т.pdf", "отчёт.pdf"), true)
  assert.equal(globMatches("?.txt", "😀.txt"), true)
  assert.equal(globMatches("гольбах*", "Гольбах Система природы.pdf"), true)
})

test("runs of stars collapse and over-long patterns are truncated", () => {
  assert.equal(normalizeGlob("***.pdf"), "*.pdf")
  assert.equal(normalizeGlob("x".repeat(300)).length, 128)
  assert.equal(globMatches("***.pdf", "a.pdf"), true)
})

test("pathological patterns finish quickly", () => {
  const match = globMatcher("*a".repeat(40) + "*b")
  const started = Date.now()
  assert.equal(match("a".repeat(255)), false)
  assert.equal(globMatcher("**********x")("y".repeat(200)), false)
  assert.ok(Date.now() - started < 100, "matcher must not backtrack exponentially")
})
