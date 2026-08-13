# Daily Learning Log

A private, mobile-friendly daily journal for cloud architecture study.

## Features

- One learning note per date
- Autosaved reflections, takeaways, open questions, and tomorrow's focus
- Searchable chronological timeline
- Daily streak, study-day, weekly, and time totals
- Per-user cloud storage through the Sites platform
- Nightly Markdown export to GitHub at 11:55 PM Eastern
- Existing chapter records preserved in the database

Daily exports are written to `daily-learning/YYYY/MM/YYYY-MM-DD.md`. The
workflow skips empty days and does not create duplicate commits when a note has
not changed.

## Local development

```bash
npm install
npm run dev
```

Run `npm run build` for a production build and `npm run db:generate` after a
database schema change.
