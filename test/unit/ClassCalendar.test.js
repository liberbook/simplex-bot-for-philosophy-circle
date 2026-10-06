import test from "node:test"
import assert from "node:assert/strict"
import {ClassSchedule} from "../../src/domain/ClassSchedule.js"
import * as calendar from "../../src/domain/ClassCalendar.js"
import {followingClass, instantOf, isActive, lastClass, nextClass, upcomingChanges} from "../../src/domain/ClassCalendar.js"
import {newSession, resolveClassDate} from "../../src/domain/Session.js"

// Wednesday 2026-09-16 10:00 UTC; classes on Tuesdays 19:00 UTC -> last 2026-09-15, next 2026-09-22
const NOW = new Date("2026-09-16T10:00:00Z")
const schedule = ClassSchedule.parse("tue 19:00", "UTC")
const session = (date, extra = {}) => ({...newSession(date, NOW), ...extra})
const dates = (r) => (r ? [r.date, r.instant.toISOString()] : null)

test("without exceptions the calendar follows the schedule", () => {
  assert.deepEqual(dates(nextClass({schedule, sessions: [], now: NOW})), ["2026-09-22", "2026-09-22T19:00:00.000Z"])
  assert.deepEqual(dates(lastClass({schedule, sessions: [], now: NOW})), ["2026-09-15", "2026-09-15T19:00:00.000Z"])
  assert.deepEqual(dates(followingClass({schedule, sessions: [], date: "2026-09-15"})), ["2026-09-22", "2026-09-22T19:00:00.000Z"])
  assert.equal(nextClass({schedule: null, sessions: [session("2026-09-22")], now: NOW}), null)
  assert.equal(nextClass({schedule, sessions: [session("2026-09-22")], now: NOW}).session.date, "2026-09-22")
})

test("a cancelled date is skipped by next, following and resolveClassDate", () => {
  const sessions = [session("2026-09-22", {status: "cancelled", movedTo: "2026-09-29"}), session("2026-09-29")]
  assert.equal(isActive(sessions[0]), false)
  assert.equal(nextClass({schedule, sessions, now: NOW}).date, "2026-09-29")
  assert.equal(followingClass({schedule, sessions, date: "2026-09-15"}).date, "2026-09-29")
  assert.equal(resolveClassDate({schedule, sessions, now: NOW}), "2026-09-29")
  // the cancelled class is not "the last one" either
  const later = new Date("2026-09-23T10:00:00Z")
  assert.equal(lastClass({schedule, sessions, now: later}).date, "2026-09-15")
  assert.equal(resolveClassDate({schedule, sessions, now: later, audio: true}), null, "the last class was 8 days ago")
})

test("a moved class is found on its new date and time, and skipped on the old one", () => {
  const sessions = [session("2026-09-22", {status: "moved", movedTo: "2026-09-23"}), session("2026-09-23", {time: "20:30"})]
  assert.deepEqual(dates(nextClass({schedule, sessions, now: NOW})), ["2026-09-23", "2026-09-23T20:30:00.000Z"])
  assert.equal(instantOf(schedule, sessions[1]).toISOString(), "2026-09-23T20:30:00.000Z")
  assert.equal(followingClass({schedule, sessions, date: "2026-09-23"}).date, "2026-09-29")
  assert.equal(followingClass({schedule, sessions, date: "2026-09-15"}).date, "2026-09-23")
  // moved earlier than the regular date: it comes first
  const early = [session("2026-09-22", {status: "moved", movedTo: "2026-09-18"}), session("2026-09-18")]
  assert.deepEqual(dates(nextClass({schedule, sessions: early, now: NOW})), ["2026-09-18", "2026-09-18T19:00:00.000Z"])
  // a past moved class is the last one
  const past = [session("2026-09-15", {status: "moved", movedTo: "2026-09-14"}), session("2026-09-14")]
  assert.equal(lastClass({schedule, sessions: past, now: NOW}).date, "2026-09-14")
  assert.equal(resolveClassDate({schedule, sessions: past, now: NOW, audio: true}), "2026-09-14")
})

test("upcomingChanges lists what differs from the weekly rule from today on", () => {
  const sessions = [
    session("2026-09-08", {status: "moved", movedTo: "2026-09-09"}), // past: not listed
    session("2026-09-09", {time: "20:00", movedFrom: "2026-09-08"}),
    session("2026-09-22", {status: "moved", movedTo: "2026-09-24"}),
    session("2026-09-24", {time: "20:00", movedFrom: "2026-09-22"}),
    session("2026-09-29", {status: "cancelled", movedTo: "2026-10-06"}),
    session("2026-10-06", {time: "18:00"}),
    session("2026-10-13"),
  ]
  assert.deepEqual(upcomingChanges({schedule, sessions, today: "2026-09-16"}), [
    {kind: "moved", date: "2026-09-22", to: "2026-09-24", time: "20:00"},
    {kind: "cancelled", date: "2026-09-29", to: "2026-10-06"},
    {kind: "time", date: "2026-10-06", time: "18:00"},
  ])
  assert.deepEqual(upcomingChanges({schedule, sessions: [session("2026-09-22", {status: "moved", movedTo: "2026-09-24"})], today: "2026-09-16"}), [{kind: "moved", date: "2026-09-22", to: "2026-09-24", time: "19:00"}], "falls back to the schedule's time")
})

test("Moscow time: dates are the schedule's local dates", () => {
  const msk = ClassSchedule.parse("вт 19:00", "Europe/Moscow")
  const now = new Date("2026-09-22T15:30:00Z") // 18:30 Moscow, half an hour before the class
  assert.deepEqual(dates(nextClass({schedule: msk, sessions: [], now})), ["2026-09-22", "2026-09-22T16:00:00.000Z"])
  assert.equal(msk.instantOn("2026-09-22", "20:15").toISOString(), "2026-09-22T17:15:00.000Z")
  assert.equal(msk.time, "19:00")
})

test("overviews: upcoming and recent classes with the markers in range, the classes of a month, counts per month and year", () => {
  const {upcomingClasses, recentClasses, classesInMonth, countByMonth, countByYear, classStatus, classCard} = calendar
  const sessions = [
    session("2026-08-25", {topic: "Old"}),
    session("2026-09-01"),
    session("2026-09-08", {topic: "Гольбах", posts: [{}, {}]}),
    session("2026-09-10", {status: "moved", movedTo: "2026-09-11"}), // an irregular marker inside the recent range
    session("2026-09-11"),
    session("2026-09-15", {status: "cancelled", movedTo: "2026-09-22"}),
    session("2026-09-22", {topic: "Substance"}),
    session("2026-09-29", {status: "moved", movedTo: "2026-09-30"}),
    session("2026-09-30", {time: "20:00", movedFrom: "2026-09-29"}),
    session("2025-12-16"),
  ]
  const brief = (items) => items.map((c) => `${c.date}${c.time ? ` ${c.time}` : ""} ${c.status}${c.session ? "" : " -"}`)
  assert.deepEqual(brief(upcomingClasses({schedule, sessions, now: NOW})), ["2026-09-22 19:00 next", "2026-09-29 19:00 moved", "2026-09-30 20:00 planned", "2026-10-06 19:00 planned -"])
  assert.deepEqual(brief(recentClasses({schedule, sessions, now: NOW})), ["2026-09-15 19:00 cancelled", "2026-09-11 19:00 past", "2026-09-10 19:00 moved", "2026-09-08 19:00 past", "2026-09-01 19:00 past"])
  assert.deepEqual(brief(upcomingClasses({schedule, sessions, now: NOW, count: 1})), ["2026-09-22 19:00 next"])
  const earlierToday = new Date("2026-09-15T20:00:00Z") // an hour after the Tuesday class
  assert.deepEqual(brief(recentClasses({schedule, sessions: [session("2026-09-15", {topic: "Today"}), session("2026-09-08")], now: earlierToday, count: 1})), ["2026-09-15 19:00 past"], "a class earlier today is already recent")
  assert.deepEqual(brief(upcomingClasses({schedule, sessions: [session("2026-09-15")], now: earlierToday, count: 1})), ["2026-09-22 19:00 next -"])
  assert.deepEqual(brief(upcomingClasses({schedule: null, sessions, now: NOW})), ["2026-09-22 planned", "2026-09-29 moved", "2026-09-30 20:00 planned"], "without a schedule only recorded classes (markers in range included), dated in UTC")
  assert.deepEqual(brief(classesInMonth({schedule, sessions, now: NOW, year: 2026, month: 9})), ["2026-09-01 19:00 past", "2026-09-08 19:00 past", "2026-09-10 19:00 moved", "2026-09-11 19:00 past", "2026-09-15 19:00 cancelled", "2026-09-22 19:00 next", "2026-09-29 19:00 moved", "2026-09-30 20:00 planned"])
  assert.deepEqual(brief(classesInMonth({schedule, sessions, now: NOW, year: 2026, month: 10})), ["2026-10-06 19:00 planned -", "2026-10-13 19:00 planned -", "2026-10-20 19:00 planned -", "2026-10-27 19:00 planned -"], "a future month shows the regular occurrences")
  assert.deepEqual(brief(classesInMonth({schedule, sessions, now: NOW, year: 2026, month: 7})), [], "a past month without records is empty")
  assert.deepEqual([...countByMonth(sessions, 2026)], [[8, 1], [9, 5]], "markers are not classes")
  assert.deepEqual([...countByYear(sessions)], [[2026, 6], [2025, 1]])
  assert.equal(classStatus({schedule, sessions, now: NOW, date: "2026-09-16"}), "past", "today's date without a class counts as past")
  const card = classCard({schedule, sessions, now: NOW, date: "2026-09-30", session: sessions[8]})
  assert.deepEqual([card.status, card.time, card.movedFrom, card.posts, card.schedule], ["planned", "20:00", "2026-09-29", [], schedule])
  assert.deepEqual(classCard({schedule, sessions, now: NOW, date: "2026-10-06"}).status, "planned")
})

test("pinnedSessions: future classes with materials and no time of their own keep the rule's time when the rule changes", () => {
  const sessions = [
    session("2026-09-15", {posts: [{itemId: 1}]}), // past: not touched
    session("2026-09-22", {posts: [{itemId: 2}]}), // future with a post: pinned at 19:00
    session("2026-09-29"), // future without materials: follows the new rule
    session("2026-10-06", {files: [{name: "a.pdf"}], time: "20:00"}), // has its own time already
    session("2026-10-13", {posts: [{itemId: 3}], status: "cancelled", movedTo: "2026-10-20"}),
  ]
  assert.deepEqual(calendar.pinnedSessions({schedule, sessions, now: NOW}).map((p) => [p.date, p.time]), [["2026-09-22", "19:00"]])
  assert.deepEqual(calendar.pinnedSessions({schedule, sessions, now: new Date("2026-09-15T20:00:00Z")}).map((p) => p.date), ["2026-09-22"], "a class held earlier today is over: by instant, not by date")
  assert.deepEqual(calendar.pinnedSessions({schedule, sessions, now: new Date("2026-09-15T18:00:00Z")}).map((p) => p.date), ["2026-09-15", "2026-09-22"], "before today's class starts it is still pinned")
  assert.deepEqual(calendar.pinnedSessions({schedule: null, sessions, now: NOW}), [])
})
