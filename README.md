# Second Brain

A private place to offload a thought in seconds, put it where it belongs, and
still find it months later. Three screens, nothing else.

## Calendar

The home screen. A month at a time, today marked, and a small dot under every
day you wrote something (solid for a thought, hollow for a book note). Tap any
day to read back what you put down that day.

## Thoughts

Type the thought, pick one of four boxes, press Enter. It is out of your head
and it is placed.

|  | Urgent | Not urgent |
| --- | --- | --- |
| **Important** | Do now | Schedule |
| **Not important** | Quick | Later |

Paste several lines at once and each line becomes its own thought in that box.

Nothing ever disappears. Checking something off leaves it in its box, struck
through, tucked behind a "show done" line. Any thought can be moved to another
box, edited, or deleted on purpose.

## Books

What you are reading, and what you are finished with. Open a book to see every
note you took from it, newest first, with an optional page number. Those notes
show up on their calendar day too, so a day of reading is visible from the
month view.

## Local development

```bash
npm install
npm run dev
```

`npm run build` produces a production build and `npm test` builds then checks
the server-rendered HTML.

The database schema is created and migrated at runtime by `ensureSchema()` in
`db/index.ts`, which is the source of truth. `db/schema.ts` describes the same
tables for `drizzle-kit`, but the old `chapters` and `daily_notes` tables from
the earlier study app still hold their rows in D1 and are deliberately no
longer described there, so `npm run db:generate` would propose dropping them.
