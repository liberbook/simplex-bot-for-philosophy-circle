# The bot's interface: every command with its answer

This document is generated from the real code: the commands run through the same
classes as in the bot (`scripts/interface-doc.js`), so the answers are the ones a
person really sees. The examples show the default language (English); the same
texts exist in every language of `src/i18n/`. Rebuild: `node scripts/interface-doc.js`.

The conditions of the examples:

- time zone `Europe/Moscow`, "now" is Wednesday 16 September 2026, 12:00;
- the schedule: every Saturday at 12:15; the next class is 19 September;
- 12 September is cancelled, its materials moved to 19 September;
- the group "Ethics", trigger word `conatus`, archive limit 10 GiB;
- `sam` - a member with a private chat, `lena` - a member without one,
  `guest` - not a member.

## Contents

1. [Private chat: the first message and the help](#private-chat-the-first-message-and-the-help)
2. [Files](#files)
3. [Classes and the schedule](#classes-and-the-schedule)
4. [Polls](#polls)
5. [Spinoza's Ethics](#spinozas-ethics)
6. [Upkeep and rights](#upkeep-and-rights)
7. [Errors and hints](#errors-and-hints)
8. [Commands in the group](#commands-in-the-group)
9. [What the bot sends on its own](#what-the-bot-sends-on-its-own)
10. [The command menu in the app](#the-command-menu-in-the-app)
11. [Short forms](#short-forms)
12. [What stands out](#what-stands-out)

## Private chat: the first message and the help

**The greeting of a group member** - right after the connection

```text
Per Deum intelligo ens absolute infinitum.
[Э1опр6]

I keep the group's files, organise the classes and help with Spinoza's Ethics.

/files - the saved files
/class - the next class, the schedule, moves
/vote - polls
/ethics - Spinoza's Ethics
/watch - notifications about classes

Commands shorten to one letter: /f, /c, /v, /e, /w.
Every command: /??
```

**The greeting of someone who is not in the group**

```text
Ea res libera dicitur, quae ex sola suae naturae necessitate existit.
[Э1опр7]

Files and classes are for members of the group I serve. What you can do here:
/ethics <ID> - a passage of the Ethics. Example: /ethics E1p7
/ethics search <text> - find text in the Ethics
/? - this help
```

**`/?`** - the short help; the words `/help`, `/помощь` work too

```text
Ad naturam substantiae pertinet existere.
[Э1т7]

I keep the group's files, organise the classes and help with Spinoza's Ethics.

/files - the saved files
/class - the next class, the schedule, moves
/vote - polls
/ethics - Spinoza's Ethics
/watch - notifications about classes

Commands shorten to one letter: /f, /c, /v, /e, /w.
Every command: /??
```

**`/??`** - every command by sections

```text
Deus, sive substantia constans infinitis attributis, necessario existit.
[Э1т11]

FILES
/files [pattern] - show the files
/get <number|name> - receive a file
/delete <number|name> - move to the deleted folder
/deleted - show the deleted files
/restore <number|name> - bring a file back
/space - storage usage
/files ? - details

CLASSES
/class [date] - one class and its materials
/class list [month|year|archive] - the lists and the archive of classes
/class schedule [weekday] [time] - show or change the schedule
/class move <date> [time] - move one class
/class cancel [date] - cancel one class
/watch [on|off] - notifications about changes
/class ? - details

POLLS
/vote - active polls
/vote <question> | <option 1> | <option 2> - create one
/vote <number> - state and results
/vote close <number> - end a poll
/vote cancel <number> - cancel
/vote history - closed polls
/vote ? - details

ETHICS
/ethics - the memo
/ethics [full|all] <ID> - a passage: E1p7, часть 1 теорема 7
/ethics search <text> - find
/ethics list <part> - the structure of a part
/ethics random - a random theorem
/ethics ? - identifiers and modes

IN THE GROUP
every file in the group is kept in the archive
conatus - as a reply to a file or right after it: I post the file in the group and send it to you privately
prius [date] - tie a file to the last class, or to the class on that date (used like conatus)
/spinoza class [date] [topic] - tie a post to a class: as the first line of the post, a reply or a comment
/spinoza schedule - show the schedule; /spinoza - the help into the private chat

OTHER
/status - the bot's state
/confirm, /drop - accept or discard a previewed change

SHORT FORMS
One letter for the section, the English word for the operation:
/f = /files
/f delete 2 = /files delete 2
/c 19.09 = /class 19.09
/c move 20:00 = /class move 20:00
/v close 1 = /vote close 1
/e full E1p7 = /ethics full E1p7
/w on = /watch on
The Russian forms /ф /з /г /э /у and /д /п /о work too

HELP
/? - the main commands
/?? - every command (this help)
/<section> ? - a section's help: /f ?, /c ?, /v ?, /e ?
```

**`/?? (as an admin)`** - two lines are added

```text
Praeter Deum nulla dari neque concipi potest substantia.
[Э1т14]

FILES
/files [pattern] - show the files
/get <number|name> - receive a file
/delete <number|name> - move to the deleted folder
/deleted - show the deleted files
/restore <number|name> - bring a file back
/space - storage usage
/files ? - details

CLASSES
/class [date] - one class and its materials
/class list [month|year|archive] - the lists and the archive of classes
/class schedule [weekday] [time] - show or change the schedule
/class move <date> [time] - move one class
/class cancel [date] - cancel one class
/watch [on|off] - notifications about changes
/class ? - details

POLLS
/vote - active polls
/vote <question> | <option 1> | <option 2> - create one
/vote <number> - state and results
/vote close <number> - end a poll
/vote cancel <number> - cancel
/vote history - closed polls
/vote ? - details

ETHICS
/ethics - the memo
/ethics [full|all] <ID> - a passage: E1p7, часть 1 теорема 7
/ethics search <text> - find
/ethics list <part> - the structure of a part
/ethics random - a random theorem
/ethics ? - identifiers and modes

IN THE GROUP
every file in the group is kept in the archive
conatus - as a reply to a file or right after it: I post the file in the group and send it to you privately
prius [date] - tie a file to the last class, or to the class on that date (used like conatus)
/spinoza class [date] [topic] - tie a post to a class: as the first line of the post, a reply or a comment
/spinoza schedule - show the schedule; /spinoza - the help into the private chat

OTHER
/status - the bot's state
/confirm, /drop - accept or discard a previewed change

SHORT FORMS
One letter for the section, the English word for the operation:
/f = /files
/f delete 2 = /files delete 2
/c 19.09 = /class 19.09
/c move 20:00 = /class move 20:00
/v close 1 = /vote close 1
/e full E1p7 = /ethics full E1p7
/w on = /watch on
The Russian forms /ф /з /г /э /у and /д /п /о work too

HELP
/? - the main commands
/?? - every command (this help)
/<section> ? - a section's help: /f ?, /c ?, /v ?, /e ?

ADMIN
/admins - the admins
/unadmin <name> - remove an admin
```

**`/spinoza`** - in a private chat - the personal help

```text
Quicquid est, in Deo est, et nihil sine Deo esse neque concipi potest.
[Э1т15]

I keep the group's files, organise the classes and help with Spinoza's Ethics.

In this private chat:
/files - the saved files
/class - the next class, the schedule, moves
/vote - polls
/ethics - Spinoza's Ethics
/watch - notifications about classes
/? - the main commands, /?? - every command
Commands shorten to one letter: /f, /c, /v, /e, /w.

In the group:
every file in the group is kept in the archive
conatus - as a reply to a file or right after it: I post the file in the group and send it to you privately
prius [date] - tie a file to the last class, or to the class on that date
/spinoza schedule - show the schedule
/spinoza class [date] [topic] - tie a post to a class
/spinoza - this help into the private chat
```

**`/? (not a member)`** - files and classes are not shown

```text
Ex necessitate divinae naturae infinita infinitis modis sequi debent.
[Э1т16]

Files and classes are for members of the group I serve. What you can do here:
/ethics <ID> - a passage of the Ethics. Example: /ethics E1p7
/ethics search <text> - find text in the Ethics
/? - this help
```

## Files

The `/файлы` section is built like `/занятие`. The canonical names stand alone: `/файлы [pattern]`, `/дай`, `/удалить`, `/корзина`, `/восстановить`, `/место`, `/файлы ?`; the same operations go through the section (`/файлы дай`) and by one letter (`/ф д`, `/ф у`, `/ф к`, `/ф в`, `/ф м`).

**`/файлы`** - the same: `/список`, `/ф`; class files are listed with the others, a long name is shortened, an empty file is flagged

```text
FILES · 9 · newest first

1. вопросы к главе 4.pdf · 120 KiB · 19.09.2026
2. Гольбах. Система природы, глава 4.pdf · 5.8 MiB · 19.09.2026
3. Access to Arasaka - l a k e s - 01 EL54…flac · 38 MiB · 08.09.2026
4. Uno.flac · 11 MiB · 08.09.2026
5. Гольбах. Система природы на 12.07.26_1.pdf · 4.7 MiB · 07.09.2026
6. Гольбах. Избранные произведения, том 1.pdf · 0 B · empty or not fully downloaded
7. запись 05.09.m4a · 24 MiB · 05.09.2026
8. Спиноза. Этика.pdf · 3.0 MiB · 05.09.2026
9. лекция 29.08.mp3 · 28 MiB · 29.08.2026

Receive: /get <number>
Filter: /files <pattern>
Help: /files ?
```

**`/файлы *.pdf`**

```text
FILES · 5 · pattern *.pdf · newest first

1. вопросы к главе 4.pdf · 120 KiB · 19.09.2026
2. Гольбах. Система природы, глава 4.pdf · 5.8 MiB · 19.09.2026
3. Гольбах. Система природы на 12.07.26_1.pdf · 4.7 MiB · 07.09.2026
4. Гольбах. Избранные произведения, том 1.pdf · 0 B · empty or not fully downloaded
5. Спиноза. Этика.pdf · 3.0 MiB · 05.09.2026

Receive: /get <number>
Filter: /files <pattern>
Help: /files ?
```

**`/д 2`** - a number from the last listing shown; the same: `/дай 2`

```text
[the bot sends the file Гольбах. Система природы, глава 4.pdf]
```

**`/дай Uno.flac`** - by name

```text
[the bot sends the file Uno.flac]
```

**`/файлы *.zip`** - nothing found

```text
No saved files match "*.zip".

List: /files
```

**`/ф д 2 (right after the empty filter)`** - an empty result does not disturb the numbering of the last listing

```text
[the bot sends the file Гольбах. Система природы, глава 4.pdf]
```

**`/дай`**

```text
Give the file's number or name.

Example: /get 3
List: /files
```

**`/дай нет.pdf`**

```text
There is no file "нет.pdf".

List: /files
```

**`/дай 99`**

```text
There is no number 99 in the list - it has 5.

List: /files
```

**`/дай *.pdf`** - more than three matches - a numbered choice

```text
FOUND · 5 · *.pdf

1. вопросы к главе 4.pdf
2. Гольбах. Система природы, глава 4.pdf
3. Гольбах. Система природы на 12.07.26_1.pdf
4. Гольбах. Избранные произведения, том 1.pdf
5. Спиноза. Этика.pdf

Receive: /get <number>
Narrow down: /get <name>
```

**`/удалить *.pdf`** - no deletion by pattern

```text
FOUND · 5 · *.pdf

1. вопросы к главе 4.pdf
2. Гольбах. Система природы, глава 4.pdf
3. Гольбах. Система природы на 12.07.26_1.pdf
4. Гольбах. Избранные произведения, том 1.pdf
5. Спиноза. Этика.pdf

Delete one at a time: /delete <number>
```

**`/удалить Спиноза. Этика.pdf`** - the number in the hint is real: the file just deleted is the first one in the deleted list

```text
Moved "Спиноза. Этика.pdf" to the deleted folder.

Bring back: /restore 1
Deleted folder: /deleted
```

**`/восстановить 1 (right after the deletion)`** - it brings back exactly that file, even if the deleted list has not been shown for a long time

```text
Restored "Спиноза. Этика.pdf" to the archive.

List: /files
```

**`/корзина`** - the same: `/файлы корзина`, `/ф к`

```text
DELETED · 2 · newest first

1. Спиноза. Этика.pdf · 3.0 MiB · 16.09.2026
2. Гольбах. Система природы на 02.08.26_2.pdf · 5.8 MiB · 01.09.2026

Bring back: /restore <number>
Help: /files ?
```

**`/восстановить 1`**

```text
Restored "Спиноза. Этика.pdf" to the archive.

List: /files
```

**`/файлы удалить вопросы к главе 4.pdf`** - a class file: the class card forgets it at once, and the answer names the card

```text
Moved "вопросы к главе 4.pdf" to the deleted folder.
Removed from the class of 19.09.2026.

Bring back: /restore 1
Deleted folder: /deleted
```

**`/занятие`** - without the deleted file

```text
NEXT CLASS

19.09.2026, 12:15
Topic: Гольбах, глава 4

Homework (sam, edited 15.09.2026):
Прочитать следующую главу.

Files:
1. Гольбах. Система природы, глава 4.pdf

Schedule: every Saturday at 12:15

Receive: /д <number>
All classes: /class list
Help: /class ?
```

**`/корзина → /ф в 1`** - the number comes from the deleted list just shown; the file returns to the class card too

```text
Restored "вопросы к главе 4.pdf" to the archive.
Back on the class of 19.09.2026.

List: /files
```

**`/файлы ?`** - the same: `/ф ?`

```text
FILES

/files [pattern]
The saved files, newest first; a pattern like *.pdf narrows the list.
Also: /list, /ф

/get <number|name>
Receive a file by its number in the list or by name.
Also: /д, /files get, /ф д

/delete <number|name>
Move a file to the deleted folder (one at a time).
Also: /files delete, /ф у

/deleted
The deleted files; kept for a limited time.
Also: /files deleted, /ф к

/restore <number|name>
Bring a file back from the deleted folder.
Also: /files restore, /ф в

/space
Used and free space.
Also: /files space, /ф м

Numbers refer to the list shown last.
```

**`/удалить`**

```text
Give the file's number or exact name, one at a time.

Example: /delete 3
List: /files
```

**`/место`**

```text
STORAGE

Archive: 115 MiB of 10 GiB
Free in the archive: 9.9 GiB

Deleted folder: 5.8 MiB · 1 file
Kept for: 30 days

Free disk space: 175 GiB

Deleted folder: /deleted
Help: /files ?
```

## Classes and the schedule

One section `/занятие`; inside it the class card, the overviews, the schedule, a move and a cancellation. The canonical name of the overview is `/занятие список` (every hint writes it that way), short `/з с`; `/занятия` and `/дз` are still synonyms.

**`/занятие`** - the same: `/з`, `/дз`; the files are numbered

```text
NEXT CLASS

19.09.2026, 12:15
Topic: Гольбах, глава 4

Homework (sam, edited 15.09.2026):
Прочитать следующую главу.

Files:
1. Гольбах. Система природы, глава 4.pdf
2. вопросы к главе 4.pdf

Schedule: every Saturday at 12:15

Receive: /д <number>
All classes: /class list
Help: /class ?
```

**`/д 1 (after the card)`** - a number from the class card

```text
[the bot sends the file Гольбах. Система природы, глава 4.pdf]
```

**`/занятие 29.08`** - a past class

```text
CLASS · past

29.08.2026, 12:15
Topic: Гольбах, глава 3

Homework (sam):
Прочитать главу 3 и выписать возражения.

Homework (lena):
Начнём с примечаний.

Recording:
1. лекция 29.08.mp3

Schedule: every Saturday at 12:15

Receive: /д <number>
All classes: /class list
Help: /class ?
```

**`/занятие 12.09`** - a cancelled class

```text
CLASS · cancelled

12.09.2026, 12:15
Homework and files moved to 19.09.2026

Schedule: every Saturday at 12:15

All classes: /class list
Help: /class ?
```

**`/занятие 26.09`** - a regular date with nothing published for it yet

```text
CLASS · planned

26.09.2026, 12:15

Nothing posted yet.

Schedule: every Saturday at 12:15

All classes: /class list
Help: /class ?
```

**`/занятие 01.01`** - not a class day

```text
There is no class "01.01".

List: /class list
```

**`/занятие список`** - the same: `/з с`, `/занятия`

```text
CLASSES

Upcoming:
19.09, 12:15 · Гольбах, глава 4 · 1 post · 2 files
26.09, 12:15 · nothing yet
03.10, 12:15 · nothing yet

Recent:
12.09 · cancelled
05.09 · recording
29.08 · Гольбах, глава 3 · 2 posts · recording
22.08 · nothing yet

Month: /class list 09.2026
Archive: /class list archive
Help: /class ?
```

**`/занятие список 09.2026`** - a month; "сентябрь 2026" is understood too

```text
CLASSES · SEPTEMBER 2026

05.09 · past · recording
12.09 · cancelled
19.09, 12:15 · next · Гольбах, глава 4 · 1 post · 2 files
26.09, 12:15 · planned · nothing yet

Previous: /class list 08.2026
Next: /class list 10.2026
```

**`/занятие список 2026`** - the months of a year

```text
CLASSES · 2026

January · 2 classes
February · 1 class
March · 1 class
August · 3 classes
September · 2 classes

Open a month: /class list 09.2026
```

**`/занятие список архив`**

```text
CLASS ARCHIVE

2026 · 9 classes
2025 · 2 classes

Open a year: /class list 2025
```

**`/занятие список завтра`** - an unclear period - and a hint on how to open a single class

```text
Which period?

/class list - upcoming and recent
/class list 09.2026 - a month
/class list 2026 - a year
/class list archive - every year
One class: /class завтра
```

**`/занятие расписание`** - the same: `/расписание`, `/з р`

```text
SCHEDULE

Every Saturday at 12:15
Time zone: Europe/Moscow

Next class:
19.09.2026, 12:15

Exceptions:
12.09.2026 · cancelled

Help: /class ?
```

**`/занятие ?`** - the same: `/з ?`

```text
CLASSES

/class [date]
The next class, or the one on that date.
Short: /з [date]

/class list [month|year|archive]
The list and the archive of classes.
Short: /з с

/class schedule [weekday] [time]
Show or change the weekly schedule.
Short: /з р

/class move <date> [time]
Move one class.
Short: /з п

/class cancel [date]
Cancel one class.
Short: /з о

Changes apply after /confirm (/п); /drop (/о) discards them.
Dates: 19.09, 19 сентября, 2026-09-19, today, tomorrow, friday.
A class's files are fetched by their number on the card: /д <number>.
Homework and posts are edited and deleted in the group, the card follows; a file is removed with /ф у <number>.
```

**`/уведомления`**

```text
Notifications about classes are off.

Turn on: /watch on
```

**`/уведомления вкл`**

```text
Notifications about classes are on: I write to you privately when the homework changes, a file is added or a recording is posted.

Turn off: /watch off
```

**`/уведомления может быть`**

```text
Send /watch on or /watch off; without a word I tell you whether they are on.
```

**`/подтвердить`** - nothing to confirm; one word for classes and for polls

```text
Nothing to confirm.

Previews come from: /class schedule, /class move, /class cancel, /vote
```

**`/отменить`** - nothing to drop

```text
Nothing to drop.

Previews come from: /class schedule, /class move, /class cancel, /vote
```

### Changing the schedule

**`/занятие расписание вт 19:00`** - a preview, nothing has changed yet; the new rule leaves the class of 19.09 with its materials alone

```text
NEW SCHEDULE

Every Tuesday at 19:00
Time zone: Europe/Moscow

Next class:
19.09.2026, 12:15

Stays as it is:
19.09.2026, 12:15

Apply: /confirm
Drop: /drop
```

**`/отменить`** - changed their mind; the same: `/занятие отменить`

```text
Dropped, nothing changed.
```

**`/подтвердить`** - after a second preview; the same: `/занятие подтвердить`

```text
Schedule changed: every Tuesday at 19:00.
Next class: 19.09.2026, 12:15.
The class of 19.09.2026, 12:15 stays as it is.
Past classes, moves, cancellations and materials are kept.
```

**`/занятие расписание`** - the new rule; the moves and cancellations are kept

```text
SCHEDULE

Every Tuesday at 19:00
Time zone: Europe/Moscow

Next class:
19.09.2026, 12:15

Exceptions:
12.09.2026 · cancelled
19.09.2026 · starts at 12:15

Help: /class ?
```

### Moving a class

**`/занятие перенос 20:00`** - only a time was given - the bot names the date

```text
Move the class of 19.09.2026 from 12:15 to 20:00?

Confirm: /confirm
Drop: /drop
```

**`/подтвердить`** - announced in the group; the private answer says where it was announced

```text
[to the group #Ethics]
Class 19.09.2026 now starts at 20:00.

Class 19.09.2026 now starts at 20:00. Announced in the group "Ethics".
```

**`/занятие перенос 21.09 20:00 → /подтвердить`** - a move to another day: the materials (posts and file references) move with it, the files stay in the archive

```text
[to the group #Ethics]
Class 19.09.2026 moved to 21.09.2026, 20:00. Its homework and files moved along.

Class 19.09.2026 moved to 21.09.2026, 20:00. Its homework and files moved along. Announced in the group "Ethics".
```

**`/занятие расписание`** - the move is visible among the exceptions

```text
SCHEDULE

Every Saturday at 12:15
Time zone: Europe/Moscow

Next class:
21.09.2026, 20:00 (moved from 19.09.2026)

Exceptions:
12.09.2026 · cancelled
19.09.2026 · moved to 21.09.2026, 20:00

Help: /class ?
```

**`/занятие перенос`**

```text
Move it where?

Example: /class move 23.09 20:00
Time only: /class move 20:00
```

### Cancelling a class

**`/занятие отмена`** - the next class

```text
Cancel the class of 19.09.2026, 12:15?

Its homework and files will move to the class of 26.09.2026, 12:15.

Confirm: /confirm
Drop: /drop
```

**`/подтвердить`**

```text
[to the group #Ethics]
Class 19.09.2026 is cancelled. Its homework and files moved to 26.09.2026.

Class 19.09.2026 is cancelled. Its homework and files moved to 26.09.2026. Announced in the group "Ethics".
```

**`/занятие список`** - after the cancellation

```text
CLASSES

Upcoming:
19.09 · cancelled
26.09, 12:15 · Гольбах, глава 4 · 1 post · 2 files
03.10, 12:15 · nothing yet
10.10, 12:15 · nothing yet

Recent:
12.09 · cancelled
05.09 · recording
29.08 · Гольбах, глава 3 · 2 posts · recording
22.08 · nothing yet

Month: /class list 09.2026
Archive: /class list archive
Help: /class ?
```

**`/занятие отмена 12.09`** - already cancelled

```text
Class 12.09.2026 is already cancelled or moved.
```

## Polls

**`/голосование`** - no active polls

```text
No active polls.

Create one: /vote <question> | <option 1> | <option 2>
Example: /vote When shall we meet? | Monday 18:30 | Tuesday 18:30
Help: /vote ?
```

**`/голосование Когда провести занятие? | Суббота 12:15 | Воскресенье 12:15 --дней 3`** - a preview

```text
NEW POLL

Когда провести занятие?

👍 Суббота 12:15
😀 Воскресенье 12:15

Mode: one option
Duration: 3 days
Group: Ethics
Closes: 19.09.2026, 12:00

Confirm: /confirm
Drop: /drop
```

**`/подтвердить`** - one message is posted in the group; the same: `/голосование подтвердить`

```text
[to the group #Ethics]
POLL #1

Когда провести занятие?

👍 Суббота 12:15
😀 Воскресенье 12:15

Choose one option with a reaction.
Closes: 19.09.2026, 12:00

Poll #1 is published in the group "Ethics".

Open: /vote 1
Close early: /vote close 1
```

**The message in the group after the votes** - the same message is edited, no new ones appear

```text
[the bot rewrites its own earlier message in the group]
POLL #1

Когда провести занятие?

👍 Суббота 12:15 · 1
😀 Воскресенье 12:15 · 1

Choose one option with a reaction.
2 votes
Closes: 19.09.2026, 12:00
```

**`/голосование`** - my active polls

```text
ACTIVE POLLS

1  Когда провести занятие?
   2 votes · until 19.09.2026, 12:00

Open: /vote 1
Create: /vote <question> | <option 1> | <option 2>
Help: /vote ?
```

**`/голосование 1`**

```text
POLL #1

Когда провести занятие?

👍 Суббота 12:15 · 1
😀 Воскресенье 12:15 · 1

Choose one option with a reaction.
2 votes
Closes: 19.09.2026, 12:00

Close early: /vote close 1
```

**`/г з 1`** - = /голосование закрыть 1; the group message is rewritten with the result

```text
Poll #1 is closed.

POLL #1 · CLOSED

Когда провести занятие?

👍 Суббота 12:15 · 1 · tied
😀 Воскресенье 12:15 · 1 · tied

2 votes
Ended: 16.09.2026, 12:00

[the bot rewrites its own earlier message in the group]
POLL #1 · CLOSED

Когда провести занятие?

👍 Суббота 12:15 · 1 · tied
😀 Воскресенье 12:15 · 1 · tied

2 votes
Ended: 16.09.2026, 12:00
```

**`/голосование история`**

```text
POLL HISTORY · 1

1  Когда провести занятие?
   2 votes · 16.09.2026

Open: /vote <number>
```

**`/голосование ?`** - the same: `/г ?`

```text
POLLS

/vote
My active polls.
Short: /г

/vote <question> | <option 1> | <option 2> [| …]
Create a poll (up to 7 options). A preview is shown; after /confirm it is published as one message in the group and members vote with reactions.
Parameters: --days <n> (duration; without it a poll closes after 8 days without a vote), --multiple (several options may be chosen), --group <name> (when there are several groups)

/vote <number>
State and results.
Short: /г <number>

/vote close <number>
End a poll (author or admin).
Short: /г з <number>

/vote cancel <number>
Cancel a published poll - with a confirmation.
Short: /г о <number>

/vote history
Closed and cancelled polls.
Short: /г и

Example: /г When shall we meet? | Monday 18:30 | Tuesday 18:30 --days 3
```

**`/голосование Когда встретимся`** - no separator

```text
Could not separate the question from the options.

Use the | character:
/vote When shall we meet? | Monday | Tuesday
```

**`/голосование Вопрос? | а | б --дней много`**

```text
The duration is a whole number of days from 1 to 365: --days 3
```

## Spinoza's Ethics

**`/этика`** - the practical memo

```text
SPINOZA, "ETHICS"

Read:
/ethics E1p7 - the passage and its proof
/ethics full E1p7 - add the scholia and corollaries
/ethics all E1p7 - also unfold the passages it refers to

Search:
/ethics search любовь

Browse the structure:
/ethics list 3
/ethics random

Short:
/e E1p7
/e full E1p7
/e all E1p7
/e search любовь
/e list 3
/e random

Help: /ethics ?
```

**`/этика ?`** - identifiers, modes, search

```text
IDENTIFIERS OF THE "ETHICS"

Э1т7       part I, theorem 7
Э1т7док    proof
Э1т6кор1   first corollary
Э1т8сх2    second scholium
Э1опр3     definition 3
Э1акс1     axiom 1
Э2пост4    postulate 4
Э2лем3     lemma 3
Э3афф1     definition of affect 1

Without "Э":
1т7

In Latin letters:
E1p7 or 1p7

MODES

/ethics <ID>
The passage and its proof.

/ethics full <ID>
Add the corollaries, scholia, explanations
and the notes belonging to the passage.

/ethics all <ID>
The full text, then the texts of every passage it refers to.

SEARCH

/ethics search <text>
/ethics search <text> part <1-5>
/ethics search <text> type <type>

Examples:
/ethics search любовь part 3
/ethics search свобода type схолия

SHORT FORMS

/e <ID>
/e full <ID> - full
/e all <ID> - all
/э п <text> - search (ч <part>, т <type>)
/э с <part> - list
/e random - random
```

**`/этика Э1т7`** - the proposition and its proof

```text
[Э1т7] Часть I · Теорема 7

Природе субстанции присуще существование.

[Доказательство] Субстанция чем-либо иным производиться не может (по кор. пред. т. [Э1т6кор1]). Значит, она будет причиной самой себя, т. е. ее сущность необходимо заключает в себе существование (по опр. 1 [Э1опр1]), иными словами, ее природе присуще существовать; что и требовалось доказать.
```

**`/э о Э1т8`** - = /этика полн Э1т8: the scholia and corollaries as well; the beginning of the answer is shown below

```text
[Э1т8] Часть I · Теорема 8

Всякая субстанция необходимо бесконечна.

[Доказательство] Субстанция, обладающая известным атрибутом, существует только одна (по т. 5 [Э1т5]), и ее природе присуще существование (по т. 7 [Э1т7]). Итак, ее природе будет свойственно существовать или как конечной, или как бесконечной. Но конечной она быть не может, так как в таком случае (по опр. 2 [Э1опр2]) она должна была бы ограничиваться другой субстанцией той же природы, которая так же необходимо должна была бы существовать (по т. 7 [Э1т7]); таким образом, существовали бы две субстанции с одним и тем же атрибутом, а это (по т. 5 [Э1т5]) невозможно. Следовательно, субстанция существует как бесконечная; что и требовалось доказать.

[Схолия 1] Так как конечное бытие в действительности есть в известной мере отрицание, а бесконечное – абсолютное утверждение существования какой-либо природы, то прямо из т. 7
… (5 more lines)

Отсюда мы можем иным путем прийти к тому заключению, что субстанция одной и той же природы существует только одна, и я счел не лишним показать здесь это. Чтобы сделать это в порядке, должно заметить, 1) что правильное определение какой-либо вещи не заключает в себе и не выражает ничего, кроме природы определяемой вещи. Отсюда следует, 2) что никакое определение не заключает в себе и не выражает какого-либо определенного числа отдельных вещей, так как оно выражает единственно только природу определяемой вещи. Так, например, определение треугольника выражает только природу треугольника, а не какое-либо определенное число треугольников. 3) Должно заметить, что для каждой существующей вещи необходимо есть какая-либо определенная причина, по которой она существует. 4) Наконец, нужно заметить, что эта причина, в силу которой какая-либо вещь существует, или должна заключаться в самой природе и
… (3 more lines)
```

**`/этика всё Э1т28`** - the full text and the propositions it refers to; a long answer, split into several messages

```text
[Э1т28] Часть I · Теорема 28

Все единичное, иными словами, всякая конечная и ограниченная по своему существованию вещь может существовать и определяться к действию только в том случае, если она определяется к существованию и действию какой-либо другой причиной, также конечной и ограниченной по своему существованию. Эта причина в свою очередь также может существовать и определяться к действию только в том случае, если она определяется к существованию и действию третьей причиной, также конечной и ограниченной по своему существованию, и так до бесконечности.

[Доказательство] Все, что определено к существованию и действию, определено таким образом Богом (по т. 26 [Э1т26] и кор. т. 24
… (11 more lines)

[Э1т24кор1] Часть I · Теорема 24 · Королларий 1
Отсюда следует, что Бог составляет причину не только того, что вещи начинают существовать, но также и того, что их существование продолжается, иными словами (пользуясь схоластическим термином), Бог есть causa essendi (причина бытия) вещей. В самом деле, существуют ли вещи или не существуют, мы всякий раз, как рассматриваем их сущность, находим, что она не заключает в себе ни существования, ни длительности, и, следовательно, сущность вещей не может быть причиной ни их существования, ни их продолжения. Такой причиной может быть только Бог, так как единственно его природе присуще существование (по кор. 1 т. 14 [Э1т14кор1]).

[Э1т21] Часть I ·
… (22 more lines)
```

**`/этика часть 1 теорема 7`** - a request in ordinary words

```text
[Э1т7] Часть I · Теорема 7

Природе субстанции присуще существование.
… (2 more lines)
```

**`/этика поиск любовь часть 3`**

```text
SEARCH IN THE ETHICS · любовь · part 3 · 41

Э3т13сх1 (схолия): Из этого мы ясно можем понять, что такое любовь и что такое ненависть. А именно, любовь есть не что …
Э3т22 (теорема): Если мы воображаем, что кто-либо причиняет любимому нами предмету удовольствие, мы будем чувствовать…
Э3т22док (доказательство): Кто причиняет удовольствие или неудовольствие любимому нами предмету тот причиняет его также и нам, …
Э3т22сх1 (схолия): Теорема 21 объясняет нам, что такое сострадание, которое мы можем определить как неудовольствие, воз…
… (24 more lines)
```

**`/этика список 1`** - the structure of a part, not a list of propositions

```text
ETHICS · PART I · 122 entries

Definitions · 8
Explanations · 2
Axioms · 7
Theorems · 36
Proofs · 39
Corollaries · 15
Scholia · 14
Appendix · 1

List them: /ethics list 1 теоремы
Open: /ethics <ID>
```

**`/э с 1 теоремы`** - = /этика список 1 теоремы: the entries of one type with the beginning of the text

```text
ETHICS · PART I · THEOREMS · 36

Э1т1 - Субстанция по природе первее своих состояний.
Э1т2 - Две субстанции, имеющие различные атрибуты, не имеют между собой ничег…
Э1т3 - Вещи, не имеющие между собой ничего общего, не могут быть причиной одн…
Э1т4 - Две или более различные вещи различаются между собой или различием атр…
… (34 more lines)
```

**`/этика случайно`** - a different proposition every time

```text
[Э3т45] Часть III · Теорема 45

Если кто воображает, что кто-либо, подобный ему, питает ненависть к другому, подобному ему, предмету, который он любит, то он будет его ненавидеть.

… (1 more lines)
```

**`/этика Э7т1`** - no such proposition

```text
There is no passage "Э7т1".

Help: /ethics ?
```

**`/этика Э1т7кор`** - a hint with the nearest forms

```text
There is no passage "Э1т7кор".

Possible forms:
Э1т7 - Часть I · Теорема 7
Э1т7док - Часть I · Теорема 7 · Доказательство

Show the whole passage: /ethics full Э1т7
```

**`/этика Э1т7 полная`** - an unrecognised mode

```text
I do not know the mode "полная".

Perhaps you meant:
/ethics full Э1т7
/ethics all Э1т7
```

**`/э Э1т7`** - the short form

```text
[Э1т7] Часть I · Теорема 7

Природе субстанции присуще существование.
… (2 more lines)
```

## Upkeep and rights

**`/статус`**

```text
STATUS

spinoza 1.2.0 · up 3h 12m
Groups: Ethics
Archive: 9 files · 115 MiB of 10 GiB
Deleted folder: 1 file · 5.8 MiB
Classes: 11
Schedule: every Saturday at 12:15

Storage: /space
```

**`/admin <secret>`** - anyone who knows the secret can become an admin

```text
Welcome, sam - you are an admin now. Send /?? to see the admin commands.
```

**`/admin не-тот-секрет`** - after five wrong tries - an hour of silence

```text
Wrong secret.
```

**`/админы`**

```text
ADMINS

sam · since 16.09.2026

Remove: /unadmin <name>
```

**`/разадмин sam`**

```text
sam is no longer an admin.
Group owners and admins keep their rights through their group role.
```

**`/разадмин lena`** - no such admin

```text
There is no admin "lena".

List: /admins
```

**`/админы (not an admin)`**

```text
Sorry, this command is for admins only.
```

**`/список (not a member)`**

```text
Sorry, only members of the group I serve can do that.

What you can do: /?
```

**`/занятие (not a member)`**

```text
Sorry, only members of the group I serve can do that.

What you can do: /?
```

The commands `/invite` and `/join` exist for admins, but are deliberately shown neither in the help nor in the hints.

## Errors and hints

**`/спсиок`** - a typo: the nearest command is suggested

```text
I do not know the command "/спсиок".

Perhaps you meant:
/список [шаблон]

Help: /?
All commands: /??
```

**`/x`** - one-letter forms are never passed off as the nearest command

```text
I do not know the command "/x".

Help: /?
All commands: /??
```

**`/xyzzy`** - no similar command

```text
I do not know the command "/xyzzy".

Help: /?
All commands: /??
```

**`привет, что ты умеешь?`** - ordinary text - the short help

```text
Deus ex solis suae naturae legibus et a nemine coactus agit.
[Э1т17]

I keep the group's files, organise the classes and help with Spinoza's Ethics.

/files - the saved files
/class - the next class, the schedule, moves
/vote - polls
/ethics - Spinoza's Ethics
/watch - notifications about classes

Commands shorten to one letter: /f, /c, /v, /e, /w.
Every command: /??
```

## Commands in the group

In the group the bot answers briefly and only to what is listed below. Everything long goes into the private chat.

**The bot has joined the group**

```text
Per Deum intelligo ens absolute infinitum.
[Э1опр6]

every file in the group is kept in the archive
conatus - as a reply to a file or right after it: I post the file in the group and send it to you privately
prius [date] - tie a file to the last class

/spinoza - open a private chat or get the help
/spinoza schedule - show the schedule
/spinoza class [date] [topic] - tie a post to a class
```

### Files

Every file posted in the group is kept in the archive - silently, until the post is deleted for everyone or a member deletes the file with `/удалить`. The group never hears about files; the trigger word asks for one privately.

**A file posted in the group** - kept in the archive, nothing is said

```text
(the bot says nothing)
```

**`conatus (in reply to a file)`** - the file goes to the private chat; also as a comment right after the file, or a comment with the name of a recent file

```text
[the bot sends the file Гольбах. Система природы, глава 5.pdf]

[to the private chat]
[the bot sends the file Гольбах. Система природы, глава 5.pdf]
```

**`conatus (no private chat yet)`** - the bot opens the chat; the request names the file

```text
[the bot sends the file Гольбах. Система природы, глава 5.pdf]

[the first message of a new private chat]
You asked for Гольбах. Система природы, глава 5.pdf - it comes here as soon as you accept this chat.
```

**…and once the member accepts the chat**

```text
[to the private chat]
[the bot sends the file Гольбах. Система природы, глава 5.pdf]
```

**`conatus (in reply to a message with no file)`** - answered privately too

```text
[to the private chat]
Which file? Write conatus as a reply to the file, or right after it was posted.
```

**`conatus (the file was deleted from the archive)`**

```text
[to the private chat]
старый конспект.pdf is no longer kept. The saved files: /files
```

**A file in reply to a class post** - it is saved to the archive and appears on the card

```text
Saved to the class of 19.09.2026: тезисы к главе 4.pdf
```

**A `prius` comment under a class recording** - the recording goes to the class that has passed (not older than a week); `prius 05.09` - to the class of that date

```text
Saved to the class of 19.09.2026: лекция 19.09.mp3
```

**`prius` when the last class is more than a week old** - a date is needed

```text
Which class? Add the date: prius <date>.
```

### `/spinoza` - the way into a private chat

**`/spinoza (a private chat exists)`** - the help goes into the private chat, the group sees one line

```text
[to the private chat]
Ea res libera dicitur, quae ex sola suae naturae necessitate existit.
[Э1опр7]

I keep the group's files, organise the classes and help with Spinoza's Ethics.

In this private chat:
/files - the saved files
/class - the next class, the schedule, moves
/vote - polls
/ethics - Spinoza's Ethics
/watch - notifications about classes
/? - the main commands, /?? - every command
Commands shorten to one letter: /f, /c, /v, /e, /w.

In the group:
every file in the group is kept in the archive
conatus - as a reply to a file or right after it: I post the file in the group and send it to you privately
prius [date] - tie a file to the last class, or to the class on that date
/spinoza schedule - show the schedule
/spinoza class [date] [topic] - tie a post to a class
/spinoza - this help into the private chat

[as a reply to the message]
The help was sent to you privately.
```

**`/spinoza (no private chat yet)`** - the bot opens the chat itself and sends the help as the first message

```text
[as a reply to the message]
I sent you a request for a private chat - accept it in your chat list, the help arrives there.

[the first message of a new private chat]
Per Deum intelligo ens absolute infinitum.
[Э1опр6]

I keep the group's files, organise the classes and help with Spinoza's Ethics.

In this private chat:
/files - the saved files
/class - the next class, the schedule, moves
/vote - polls
/ethics - Spinoza's Ethics
/watch - notifications about classes
/? - the main commands, /?? - every command
Commands shorten to one letter: /f, /c, /v, /e, /w.

In the group:
every file in the group is kept in the archive
conatus - as a reply to a file or right after it: I post the file in the group and send it to you privately
prius [date] - tie a file to the last class, or to the class on that date
/spinoza schedule - show the schedule
/spinoza class [date] [topic] - tie a post to a class
/spinoza - this help into the private chat
```

**`/spinoza (direct messages are off in the group)`** - a one-time link is left instead; asking again gives the same link

```text
[as a reply to the message]
One-time link for a private chat:
https://simplex.chat/invitation#1
```

**`/spinoza ??`** - the full help into the private chat

```text
[to the private chat]
Ad naturam substantiae pertinet existere.
[Э1т7]

FILES
/files [pattern] - show the files
/get <number|name> - receive a file
/delete <number|name> - move to the deleted folder
/deleted - show the deleted files
/restore <number|name> - bring a file back
/space - storage usage
/files ? - details

CLASSES
/class [date] - one class and its materials
/class list [month|year|archive] - the lists and the archive of classes
/class schedule [weekday] [time] - show or change the schedule
/class move <date> [time] - move one class
/class cancel [date] - cancel one class
/watch [on|off] - notifications about changes
/class ? - details

POLLS
/vote - active polls
/vote <question> | <option 1> | <option 2> - create one
/vote <number> - state and results
/vote close <number> - end a poll
/vote cancel <number> - cancel
/vote history - closed polls
/vote ? - details

ETHICS
/ethics - the memo
/ethics [full|all] <ID> - a passage: E1p7, часть 1 теорема 7
/ethics search <text> - find
/ethics list <part> - the structure of a part
/ethics random - a random theorem
/ethics ? - identifiers and modes

IN THE GROUP
every file in the group is kept in the archive
conatus - as a reply to a file or right after it: I post the file in the group and send it to you privately
prius [date] - tie a file to the last class, or to the class on that date (used like conatus)
/spinoza class [date] [topic] - tie a post to a class: as the first line of the post, a reply or a comment
/spinoza schedule - show the schedule; /spinoza - the help into the private chat

OTHER
/status - the bot's state
/confirm, /drop - accept or discard a previewed change

SHORT FORMS
One letter for the section, the English word for the operation:
/f = /files
/f delete 2 = /files delete 2
/c 19.09 = /class 19.09
/c move 20:00 = /class move 20:00
/v close 1 = /vote close 1
/e full E1p7 = /ethics full E1p7
/w on = /watch on
The Russian forms /ф /з /г /э /у and /д /п /о work too

HELP
/? - the main commands
/?? - every command (this help)
/<section> ? - a section's help: /f ?, /c ?, /v ?, /e ?

[as a reply to the message]
The help was sent to you privately.
```

**`/spinoza (the fourth time in 10 minutes)`** - after that - silence

```text
[as a reply to the message]
Too many messages - please wait 10 minutes.
```

### Classes in the group

**`/spinoza расписание`** - the schedule can only be changed in a private chat

```text
SCHEDULE

Every Saturday at 12:15
Next class: 19.09.2026, 12:15
```

**`/spinoza расписание вт 19:00`** - in the group it only shows, with a hint where to go

```text
SCHEDULE

Every Saturday at 12:15
Next class: 19.09.2026, 12:15

Change it: in the private chat, /class schedule
```

**`/spinoza занятие`** - the command on its own with nothing to tie - the next class card is shown

```text
NEXT CLASS

19.09.2026, 12:15
Topic: Гольбах, глава 4

Homework (sam, edited 15.09.2026):
Прочитать следующую главу.

Files:
1. Гольбах. Система природы, глава 4.pdf
2. вопросы к главе 4.pdf

Schedule: every Saturday at 12:15
```

**`/spinoza занятие Гольбах, глава 5\nПрочитать главу 5.`** - as the first line of a post: the text of the post becomes the homework

```text
Post tied to the class of 19.09.2026, 12:15.
```

**`/spinoza занятие 26.09 Гольбах, глава 6`** - with a date and a topic

```text
Post tied to the class of 26.09.2026, 12:15.
```

A file sent in reply to a class post is attached - it is saved quietly and appears on the card (`/занятие`); the archive stays flat, the card holds a reference.

### Private commands in the group

**`/список (in the group)`** - every private command in the group gets the same single line; after three hints in 10 minutes - silence

```text
[as a reply to the message]
This is done in the private chat: write to me or send /spinoza.
```

The next `/дай 1`, `/этика Э1т7`, `/?`, `/статус` from the same member: 2 hints, then silence.

**`/занятие перенос 20:00 (in the group)`** - an operation of the class section is not carried out in the group and changes no class (the topic is still "Гольбах, глава 4")

```text
[as a reply to the message]
This is done in the private chat: write to me or send /spinoza.
```

### Ordinary phrases

**Members' phrases that begin with command words or contain conatus**

```text
список дел на неделю
Занятие переносится на вторник?
Расписание пока прежнее
Спиноза писал о conatus как о стремлении
Задание: прочитать главу 5
prius est quam posterius
```

The answer: the bot says nothing and sends nothing - in the group a command starts with a slash (the bare word prius aside), and conatus asks for a file only as a bare word: in reply to a file or as a comment right after it.

## What the bot sends on its own

**The reminder in the group** - 30 minutes before the class, once

```text
The class starts in 30 minutes: Гольбах, глава 4.
```

**A subscriber's notification about changes** - one message per class after a pause, not one per change

```text
Class 19.09.2026: new post (lena); file(s) added: тезисы.pdf.

Details: /class 19.09
```

The announcements of a move and of a cancellation the bot sends to the group itself - they are shown above together with the commands `/занятие перенос` and `/занятие отмена`.

## The command menu in the app

SimpleX shows this list under the commands button in the chat with the bot:

```text
'Help':/?
'Files':/files
'Get a file':/'get <number|name>'
'Next class':/class
'Classes':/'class list'
'Schedule':/'class schedule'
'Polls':/vote
'Spinoza, Ethics':/'ethics <ID>'
'Search the Ethics':/'ethics search <text>'
'Notifications':/watch
'All commands':/??
```

## Short forms

Every section and every frequent operation is one letter (the first one): `/ф` files, `/з` class, `/г` poll, `/э` ethics, `/у` notifications, `/с` status, `/д` get, `/п` confirm, `/о` drop, `/?` help. Inside a section it is the first letter of the operation as well.

**`/з с`** - = /занятие список

```text
CLASSES

Upcoming:
19.09, 12:15 · Гольбах, глава 4 · 1 post · 2 files
26.09, 12:15 · nothing yet
03.10, 12:15 · nothing yet

Recent:
12.09 · cancelled
05.09 · recording
29.08 · Гольбах, глава 3 · 2 posts · recording
22.08 · nothing yet

Month: /class list 09.2026
Archive: /class list archive
Help: /class ?
```

**`/з п 20:00`** - = /занятие перенос 20:00

```text
Move the class of 19.09.2026 from 12:15 to 20:00?

Confirm: /confirm
Drop: /drop
```

**`/о`** - = /отменить

```text
Dropped, nothing changed.
```

**`/у вкл`** - = /уведомления вкл

```text
Notifications about classes are on: I write to you privately when the homework changes, a file is added or a recording is posted.

Turn off: /watch off
```

**`/с`** - = /статус

```text
STATUS

spinoza 1.2.0 · up 3h 12m
Groups: Ethics
Archive: 9 files · 115 MiB of 10 GiB
Deleted folder: 1 file · 5.8 MiB
Classes: 11
Schedule: every Saturday at 12:15

Storage: /space
```

**`/ф к`** - = /файлы корзина

```text
DELETED · 1 · newest first

1. Гольбах. Система природы на 02.08.26_2.pdf · 5.8 MiB · 01.09.2026

Bring back: /restore <number>
Help: /files ?
```

**`/э л`** - = /этика случайно

```text
[Э3т45] Часть III · Теорема 45

Если кто воображает, что кто-либо, подобный ему, питает ненависть к другому, подобному ему, предмету, который он любит, то он будет его ненавидеть.
… (2 more lines)
```

**`/г и`** - = /голосование история

```text
No closed polls yet.

List: /vote
```

**`/ф ?`** - the section help: `?` instead of the word "help"

```text
FILES

/files [pattern]
The saved files, newest first; a pattern like *.pdf narrows the list.
Also: /list, /ф

/get <number|name>
Receive a file by its number in the list or by name.
Also: /д, /files get, /ф д

/delete <number|name>
Move a file to the deleted folder (one at a time).
Also: /files delete, /ф у

/deleted
The deleted files; kept for a limited time.
Also: /files deleted, /ф к

/restore <number|name>
Bring a file back from the deleted folder.
Also: /files restore, /ф в

/space
Used and free space.
Also: /files space, /ф м

Numbers refer to the list shown last.
```

## What stands out

The rules the answers above obey - and what is still uneven:

1. **One confirmation.** Every preview ends with "Confirm: /confirm" and "Drop: /drop";
   `/занятие подтвердить`, `/голосование отменить` are synonyms of the same two words.
2. **Dates in digits.** In sentences "19.09.2026, 12:15", in the rows of a list "19.09".
3. **Commands in hints** are named as in the section help: `/занятие перенос`, `/файлы дай`.
4. **A report = HEADING, body, "Label: /command".** Every answer of a section without
   arguments ends with the line "Help: /<section> ?" ("Help: /class ?").
5. **The separator `·`, the ellipsis `…`, counts in words** ("2 votes", "3 days", "30 minutes").
6. **File names as stored**, shortened when long, everywhere a person reads; the full stored name only in `/дай`.
7. **In the group - only group commands**, every action is confirmed with one line,
   every failure is explained with one line; any private command in the group gets one
   line "This is done in the private chat" (rate-limited, so it never becomes noise).
   Files are the exception: they are kept silently, and conatus is answered in the private chat only.
9. **One name per command.** Files keep stand-alone names (`/дай`, `/удалить`, `/корзина`),
   classes are `/занятие <operation>` (`/занятие список`); the help, the footers and the hints write it the same way.
10. **The greeting, `/?` and `/spinoza` list the sections with one and the same block of lines.**
11. **A new schedule leaves the classes that have materials alone:** they keep their own time and
    are listed in the preview ("Stays as it is").
12. **In the group a command starts with a slash.** A phrase like "Занятие переносится…" or "Спиноза писал о conatus…" is
    talk: the bot says nothing and sends nothing; without a slash only conatus (as a bare word, in reply
    to a file or right after it) and prius (as a bare word or with a date) work.
8. **The help is `?`.** `/?` the main commands, `/??` all of them, `/<section> ?` the help of a section;
   the words `help`, `помощь`, `справка` are understood but appear nowhere.

Still uneven:

- **The short forms are Russian letters only.** The English words (`/get`, `/class`) exist, but
  there are no one-letter English forms; in the English build the hints show `/ф`, `/з` too.
- **"Recent" in `/занятие список`** shows three classes plus the marks of the cancellations and moves
  from the same stretch of time, so there can be more than three rows.
- **The Ethics section answers in Russian** in the English build too: the text of the Ethics exists
  only in translation, and the identifiers `Э1т7` are the same in both languages.
