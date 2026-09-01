# CLAUDE.md

This file gives coding agents repository-specific guidance.

## Repository scope

Two unrelated projects live side by side:

1. **Second Brain** (`app/`, `components/`, `db/`, `lib/`, `public/`,
   `worker/`, and root configuration) is the actively developed product. It is
   a Next-style App Router application compiled by vinext for Cloudflare
   Workers and backed by Cloudflare D1.
2. **`work/markdown-notes/`** is a standalone, ignored Python CLI for
   spaced-repetition review of certificate study notes. It is not installed,
   built, tested, or deployed with Second Brain. Its own workflow is documented
   in `work/markdown-notes/README.md`.

Second Brain has exactly four tabs: Calendar, Thoughts, Books, and Review. The
Calendar also renders a daily `Briefing` above the month view. See `README.md`
for the user-facing behavior.

## Commands

The app requires Node.js 22.13 or newer.

```bash
npm install
npm run dev          # vinext dev through Wrangler/Miniflare
npm run build        # vinext build -> dist/
npm run start        # serve an existing production build locally
npm test             # build, then node --test tests/rendered-html.test.mjs
npm run lint         # eslint source files; generated build directories are ignored
npm run db:generate  # drizzle-kit generate from db/schema.ts -> drizzle/
```

`tests/rendered-html.test.mjs` is the only automated test. It imports the built
worker from `dist/server/index.js` and verifies the server-rendered shell, so it
must run after a build; `npm test` handles that ordering. It supplies only a
mock `ASSETS` binding and does not exercise D1 or the client-side APIs. The
assertions cover the app title, root marker, four tab labels, and initial
loading-state copy.

## Runtime and deployment

- `vinext` compiles the route tree in `app/` into a Cloudflare Worker build.
- `worker/index.ts` is the actual Worker entry point. It handles
  `/_vinext/image` with Cloudflare image transforms and otherwise delegates to
  vinext's `app-router-entry` handler.
- `vite.config.ts` configures vinext and `@cloudflare/vite-plugin`. Its inline
  binding config supplies the `DB` D1 name and ID and uses `worker/index.ts` as
  the entry point. It also moves Wrangler/Miniflare logs and state under the
  ignored `.wrangler/` directory; Codex Seatbelt previews use polling for HMR.
- `wrangler.jsonc` owns the Worker name, compatibility settings, static-assets
  binding, asset-cache setting, and source entry point. The build merges this
  with the Vite D1 binding into `dist/server/wrangler.json`.
- `.github/workflows/deploy.yml` installs with Node 22, builds on every push to
  `main`, and deploys the generated Wrangler config. It requires the GitHub
  secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Deploy the generated config, not the root config directly:

```bash
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

## Data layer

The schema has two representations that must stay synchronized by hand:

- `db/index.ts` is the live source of truth. `ensureSchema()` is memoized per
  Worker isolate and creates or migrates `thoughts`, `books`, and `book_notes`
  on first use. Thought rows include a long-form `notes` field linked to the
  compact matrix title. Their existing `day_key` is the immutable local capture
  day; the nullable `scheduled_day_key` can be changed or cleared without
  rewriting capture history. Book-note rows likewise include a long-form `notes`
  field linked to their compact main idea. It also removes retired `chapters` and `daily_notes`
  tables, folds legacy thought metadata into the body, and removes the retired
  book `author` column when those older shapes are encountered.
- `db/schema.ts` describes the same final three-table shape for Drizzle only.
  `npm run db:generate` records changes under `drizzle/`; those generated SQL
  files are not executed by the app at runtime.

For a schema change, implement safe runtime creation/migration in
`ensureSchema()` or its migration helpers first, mirror the final shape in
`db/schema.ts`, and then run `npm run db:generate`.

## API and identity

The three route handlers are `app/api/thoughts/route.ts`,
`app/api/books/route.ts`, and `app/api/book-notes/route.ts`. Each handler:

- calls `ensureSchema()` before accessing D1;
- uses prepared raw SQL from `getD1()`;
- scopes every query to the fixed `OWNER_ID` exported by
  `app/api/shared.ts`;
- catches failures and returns the shared generic 500 response; and
- caps list responses with the shared `MAX_ROWS` limit.

There is no login, cookie session, or multi-user isolation: all traffic shares
`local-preview-user`. If authentication is added, resolve the identity once in
`app/api/shared.ts` and keep every query owner-scoped.

Thought and book-note POST handlers pass input through `captureLines()` and
`stagger()`: each non-empty line becomes a row, and strictly increasing
millisecond timestamps preserve input order. A capture accepts at most the
shared `MAX_CAPTURE_LINES` limit (currently 50). Both bodies are capped at
4,000 characters per row; a note page value is capped at 40 characters.

Deleting a book removes its notes and book row in one D1 batch. A completed
thought stores both `status = 'done'` and `done_at`; Review uses `done_at` for
period completion statistics.

## Frontend

- `app/page.tsx` force-renders dynamically and mounts
  `components/SecondBrain.tsx`.
- `SecondBrain` is the client-side state and network container. It loads
  thoughts, books, and notes in parallel on mount, owns retries and online
  status, selects among the four tabs, renders the Calendar's `Briefing`, and
  passes state, read-only status, and callbacks to the tab components.
- `TaskDetail` is the focused document view opened from matrix, Calendar,
  Review, and urgent Briefing thought-title links. It auto-saves long-form
  notes, title, and the optional scheduled day through a serialized update
  queue without creating a separate note row. It displays the immutable capture
  day and latest modification day alongside that control. Every edit is
  first mirrored to a per-task `localStorage` recovery draft, and lifecycle
  events flush the latest draft with a keepalive request. The quadrant is
  context, not an editable property, in this view.
- `BookNoteDetail` is the parallel focused document view for reading notes. A
  compact main idea opens into an auto-saving canvas with long-form content and
  optional start/end pages. It intentionally has no scheduling control. Like
  task detail, it serializes updates, uses a per-note `localStorage` recovery
  draft, displays capture and latest modification days, flushes with keepalive
  on lifecycle events, and can be restored from its `?note=` URL.
- Data fetching uses plain `fetch`, `cache: "no-store"`, and React state.
  Same-origin API redirects are handled manually so an expired Cloudflare
  Access session can reload into its login flow. Thought/note PATCH actions
  update locally first and reload after a failure. Deletes call the API
  immediately, keep the row visible and locked while the request is in flight,
  and remove it only after confirmation; a failed delete leaves the row in
  place. A delete 404 is treated as success because the requested server state
  has already been reached. Book completion waits for the server response.
- `components/UiState.tsx` owns the shared loading, quiet empty/failure, and
  offline/error banner patterns. If the initial load fails, the app shows a
  full-page retry state. Once data has loaded, going offline keeps it readable,
  displays an offline banner, and disables write controls until reconnection.
- The browser's current `today` value comes from `useSyncExternalStore` and is
  empty during server rendering. Do not compute it on the Worker, which runs in
  UTC and may differ from the user's local date.
- `ReviewTab` has no API or persisted state. It derives the current week/month
  recap, carryover, daily activity, and priority list from the already-loaded
  arrays.
- Fixed quadrant keys and labels live in `lib/quadrants.ts`: `do`, `plan`,
  `quick`, and `later`. Change that module first if quadrant semantics change.
- Shared date helpers, spring presets, and API data types live in `lib/`.

## Design and motion

- Preserve the established editorial-minimal direction: self-hosted Fraunces
  for display text, the Apple/system sans stack for controls and body copy,
  restrained monochrome surfaces, rounded cards, and semantic color for
  quadrant or status meaning. Global tokens and responsive rules live in
  `app/globals.css`.
- Motion is intentional and uses `motion/react` for tab transitions, shared
  selection pills, entrances, layout changes, progress, and counters. The app
  is wrapped in `MotionConfig reducedMotion="user"`; components that animate
  outside ordinary motion variants must also use `useReducedMotion` or a CSS
  `prefers-reduced-motion` rule.
- The desktop masthead switches to a mobile bottom tab bar below 760px. The
  masthead date is hidden at 900px and below to prevent tablet overlap. Keep
  frequently used narrow-screen controls at least 44px in either dimension.
- Reuse `UiState` for new loading, empty, offline, or failure experiences
  rather than introducing tab-specific state styling.

## PWA behavior

`app/layout.tsx` declares the manifest, theme, Apple mobile metadata, favicon,
and absolute social-image metadata. `components/ServiceWorkerRegister.tsx`
registers `public/sw.js` after window load.

The service worker precaches the shell and core icons. It uses network-first
navigation with a cached `/` fallback and cache-first static assets with a
background refresh. It deliberately bypasses every `/api/` request, so no user
data is cached for offline use. The in-memory data already loaded by the client
remains readable after a connection drop, but a fresh offline load cannot
recover API data. When changing the cached shell or service worker behavior,
bump the `CACHE` value in `public/sw.js` so old caches are evicted during
activation.
