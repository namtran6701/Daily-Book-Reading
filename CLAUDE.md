# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Two unrelated things live side by side:

1. **Second Brain** (`app/`, `db/`, `worker/`, root config) — a Next.js app that runs on Cloudflare Workers via `vinext`, storing data in a Cloudflare D1 (SQLite) database. This is the actively developed product.
2. **`work/markdown-notes/`** — a standalone Python CLI (`notes.py`) for the user's own cert study notes (spaced-repetition review of Markdown chapter notes). It has no dependency on the app and isn't built/deployed with it. See `work/markdown-notes/README.md` for its own workflow.

Second Brain is a calendar + Eisenhower-matrix thought capture tool + book notes, described in the root `README.md`. There are exactly four tabs: Calendar, Thoughts, Books, Review (a client-side weekly/monthly recap computed from existing data).

## Commands (Second Brain app)

```bash
npm install
npm run dev          # vinext dev (Cloudflare Workers dev server via wrangler/miniflare)
npm run build        # vinext build -> dist/
npm test             # build, then node --test tests/rendered-html.test.mjs
npm run lint         # eslint .
npm run db:generate  # drizzle-kit generate (writes drizzle/*.sql from db/schema.ts)
```

There is no separate unit-test runner or watch mode — `tests/rendered-html.test.mjs` is the only test file, and it imports the built worker from `dist/server/index.js`, so it only works after `npm run build` (which `npm test` does for you). To run it directly after a build: `node --test tests/rendered-html.test.mjs`.

## Architecture

**Runtime**: `vinext` (a Next.js-on-Vite adapter) compiles the App Router app in `app/` for Cloudflare Workers. `worker/index.ts` is the actual Workers entry point — it handles `/_vinext/image` itself and otherwise delegates to vinext's `app-router-entry` handler. `vite.config.ts` wires up the `vinext()`, a custom `sites()` plugin, and the `@cloudflare/vite-plugin`, binding a D1 database and (optionally) an R2 bucket per `.openai/hosting.json`.

**Data layer — two sources of truth that must stay in sync by hand**:
- `db/index.ts`'s `ensureSchema()` runs on every cold start (memoized in `schemaPromise`) and is what actually creates/migrates tables in D1 via raw SQL (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE`, backfill `UPDATE`s). This is the real source of truth for the live schema.
- `db/schema.ts` is a parallel Drizzle description of the *same* tables, used only by `drizzle-kit generate` to produce migration files under `drizzle/`. It intentionally omits the legacy `chapters` and `daily_notes` tables from an earlier "study app" incarnation, which still have rows in D1 — so `db:generate` will propose dropping them; don't do that.
- When changing a table shape: add the migration logic to `ensureSchema()`/its `migrate*` helpers in `db/index.ts` first (that's what actually runs), then mirror the final shape in `db/schema.ts`, then run `npm run db:generate` to record it.

**API routes** (`app/api/*/route.ts`: `thoughts`, `books`, `book-notes`) are plain Next.js Route Handlers, all following the same shape:
- Auth is header-based, not a session/cookie system: `apiUserId()` in `app/api/shared.ts` reads `oai-authenticated-user-id` (set upstream by the ChatGPT connector integration), falling back to a fixed `local-preview-user` id on `localhost`/`127.0.0.1` for local dev.
- Every handler calls `ensureSchema()` before touching the DB, binds parameters into raw SQL via `getD1().prepare(...)`, and wraps the body in try/catch → `failure()` (shared.ts) for a generic 500.
- Multi-line paste-to-capture (thoughts and book notes) is handled by `captureLines()` + `stagger()` in `shared.ts`: each newline becomes its own row, and `stagger()` mints strictly increasing millisecond timestamps so a batch insert reads back in the order it was typed.

**Frontend**: React components live in `components/`, shared pure utilities (dates, quadrants, spring presets, shared types) in `lib/`; `app/` holds only route files (`page.tsx`, `layout.tsx`, `api/`) plus `globals.css` and `icon.svg`. `components/SecondBrain.tsx` is the single client-side container — it owns all state (thoughts/books/notes), does one `Promise.all` fetch on mount, and passes data + callbacks down to `CalendarTab`, `MatrixTab`, and `BooksTab`. There's no client-side data-fetching library; it's plain `fetch` + `useState`, with optimistic local updates on PATCH/DELETE that roll back by re-`load()`ing on failure. `app/page.tsx` renders `<SecondBrain />` under `dynamic = "force-dynamic"` (no static generation — the app is inherently per-user/dynamic). The current wall-clock day (`today`) is deliberately only computed client-side via `useSyncExternalStore` since the Worker runs in UTC.

**Quadrants**: the Eisenhower matrix has exactly four fixed buckets defined once in `lib/quadrants.ts` (`do`, `plan`, `quick`, `later`) — this is the module to touch if quadrant labels/semantics ever change, everything else imports from it.
