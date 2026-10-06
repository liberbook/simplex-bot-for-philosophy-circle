import test from "node:test"
import assert from "node:assert/strict"
import {ClassSchedule, addDays} from "../../src/domain/ClassSchedule.js"
import {parseDate, parseAnnouncement, resolveClassDate, isAudio, formatDate} from "../../src/domain/Session.js"

test("schedule parsing in Russian and English", () => {
  const s = ClassSchedule.parse("вт 19:00", "Europe/Moscow")
  assert.deepEqual(s.toJSON(), {weekday: 2, hour: 19, minute: 0, timezone: "Europe/Moscow"})
  assert.equal(ClassSchedule.parse("Tuesday 19.30").weekday, 2)
  assert.equal(ClassSchedule.parse("вторник 09:05").minute, 5)
  assert.equal(ClassSchedule.parse("пн 25:00"), null)
  assert.equal(ClassSchedule.parse("someday 10:00"), null)
  assert.equal(ClassSchedule.parse(""), null)
})

test("next and last occurrence respect the time zone and the week boundary", () => {
  const s = ClassSchedule.parse("вт 19:00", "Europe/Moscow") // UTC+3
  // Monday 2026-09-14 12:00 UTC -> next class Tue 2026-09-15 16:00 UTC, last one Tue 2026-09-08
  const monday = new Date("2026-09-14T12:00:00Z")
  assert.equal(s.nextOccurrence(monday).toISOString(), "2026-09-15T16:00:00.000Z")
  assert.equal(s.localDate(s.nextOccurrence(monday)), "2026-09-15")
  assert.equal(s.localDate(s.lastOccurrence(monday)), "2026-09-08")
  // Tuesday 15:59 UTC (18:59 Moscow): the class today is still "next"; at 16:00 it becomes "last"
  assert.equal(s.localDate(s.nextOccurrence(new Date("2026-09-15T15:59:00Z"))), "2026-09-15")
  assert.equal(s.localDate(s.nextOccurrence(new Date("2026-09-15T16:00:00Z"))), "2026-09-15")
  assert.equal(s.localDate(s.nextOccurrence(new Date("2026-09-15T16:00:01Z"))), "2026-09-22")
  assert.equal(s.localDate(s.lastOccurrence(new Date("2026-09-15T16:00:01Z"))), "2026-09-15")
  // late evening in Moscow is already the next day in local terms
  const late = ClassSchedule.parse("ср 00:30", "Europe/Moscow")
  assert.equal(late.localDate(new Date("2026-09-15T21:30:00Z")), "2026-09-16")
  assert.equal(late.nextOccurrence(new Date("2026-09-15T21:00:00Z")).toISOString(), "2026-09-15T21:30:00.000Z")
  assert.equal(addDays("2026-12-30", 3), "2027-01-02")
})

test("dates in free text, with the nearest year when none is given", () => {
  const now = new Date("2026-09-07T10:00:00Z")
  assert.equal(parseDate("14.09", now), "2026-09-14")
  assert.equal(parseDate("14.09.2026", now), "2026-09-14")
  assert.equal(parseDate("14/09/26", now), "2026-09-14")
  assert.equal(parseDate("2026-09-14", now), "2026-09-14")
  assert.equal(parseDate("занятие 14 сентября", now), "2026-09-14")
  assert.equal(parseDate("5 мая 2027", now), "2027-05-05")
  assert.equal(parseDate("10.01", now), "2027-01-10") // January is nearer next year
  assert.equal(parseDate("31.02", now), null)
  assert.equal(parseDate("no date here", now), null)
  assert.equal(formatDate("2026-09-14"), "14.09.2026")
  // natural words count from `today` (the schedule's local day), Monday 2026-09-07
  assert.equal(parseDate("сегодня", now, "2026-09-07"), "2026-09-07")
  assert.equal(parseDate("завтра 18:30", now, "2026-09-07"), "2026-09-08")
  assert.equal(parseDate("послезавтра", now, "2026-09-07"), "2026-09-09")
  assert.equal(parseDate("в пятницу", now, "2026-09-07"), "2026-09-11")
  assert.equal(parseDate("понедельник", now, "2026-09-07"), "2026-09-07", "today's weekday is today")
  assert.equal(parseDate("tomorrow", now, "2026-09-30"), "2026-10-01")
  assert.equal(parseDate("вторник", now), "2026-09-08", "without a schedule: UTC today")
  assert.equal(parseDate("средавая", now, "2026-09-07"), null, "only whole words")
  assert.equal(parseDate("вторая среда", now, "2026-09-07"), "2026-09-09")
})

test("announcement parsing: command, date, topic, homework text", () => {
  const now = new Date("2026-09-07T10:00:00Z")
  assert.deepEqual(parseAnnouncement("/занятие 14.09 Спиноза, часть 1\nПрочитать Э1т1-Э1т10\nи схолии", now), {date: "2026-09-14", topic: "Спиноза, часть 1", text: "Прочитать Э1т1-Э1т10\nи схолии"})
  assert.deepEqual(parseAnnouncement("/занятие\nЗадание", now), {date: null, topic: null, text: "Задание"})
  assert.deepEqual(parseAnnouncement("/session Ethics", now), {date: null, topic: "Ethics", text: ""})
  assert.deepEqual(parseAnnouncement("/spinoza занятие завтра Свобода\nТекст", now, 2, "2026-09-07"), {date: "2026-09-08", topic: "Свобода", text: "Текст"})
  assert.deepEqual(parseAnnouncement("/class в пятницу - Тема", now, 1, "2026-09-07"), {date: "2026-09-11", topic: "Тема", text: ""})
})

test("which class a message belongs to", () => {
  const schedule = ClassSchedule.parse("вт 19:00", "UTC")
  const wednesday = new Date("2026-09-16T10:00:00Z") // the class was yesterday
  assert.equal(resolveClassDate({schedule, now: wednesday}), "2026-09-22") // homework prepares the next class
  assert.equal(resolveClassDate({schedule, now: wednesday, audio: true}), "2026-09-15") // the recording is of the last class
  assert.equal(resolveClassDate({schedule, now: new Date("2026-09-30T10:00:00Z"), audio: true}), "2026-09-29")
  assert.equal(resolveClassDate({schedule, now: new Date("2026-10-01T10:00:00Z"), audio: true, recentAfterMs: 86_400_000}), null) // too long ago
  assert.equal(resolveClassDate({schedule, now: wednesday, explicitDate: "2026-10-06"}), "2026-10-06")
  assert.equal(resolveClassDate({schedule: null, now: wednesday}), null)
  assert.equal(isAudio({name: "lecture.MP3"}), true)
  assert.equal(isAudio({name: "note.pdf", contentType: "voice"}), true)
  assert.equal(isAudio({name: "note.pdf", contentType: "file"}), false)
})
