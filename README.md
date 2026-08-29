# Second Brain

A focused, single-user place to capture thoughts, sort them by priority, keep
reading notes, and review your recent progress. The app has four tabs:
Calendar, Thoughts, Books, and Review.

## Calendar

The home screen opens with a daily briefing: open-thought and capture counts,
the current book, and a warning when an urgent item has been waiting for at
least two days.

The calendar shows one month at a time. Today is marked, solid dots represent
thoughts, and hollow dots represent book notes. Select a date to read its
thoughts and book notes together; thoughts can also be completed, edited, or
deleted from the day panel.

## Thoughts

Type a thought, choose one of four Eisenhower-matrix quadrants, and press Enter
or use the submit button:

|  | Urgent | Not urgent |
| --- | --- | --- |
| **Important** | Do now | Schedule |
| **Not important** | Quick | Later |

Pasting multiple lines creates one thought per non-empty line in the selected
quadrant. Thoughts can be completed, reopened, edited, deleted, or dragged to a
different quadrant. Completed thoughts remain available behind each
quadrant's **Show done** control.

Select a thought's linked title to open its task detail page. The short title
stays compact in the matrix while the linked page provides a large, auto-saving
notes canvas for context, links, and working notes. The same page can change
the due date and title; its quadrant remains fixed while the canvas is open.
Notes remain attached to that thought and are available from both the matrix
and Calendar.

Task-canvas edits are copied immediately to a per-task draft in the browser,
then sent to D1 after a short pause. Back navigation, backgrounding, and page
exit also trigger a final save attempt. The browser draft is removed after D1
confirms the latest title, notes, and due date; if that request is interrupted,
the draft is restored and retried the next time the task opens.

Deletion requests are sent immediately, and the row remains visible with a
progress indicator until the server confirms the removal. There is no Undo
window. Deleting a book also deletes its notes.

## Books

Add books to the **Reading now** shelf, open a book to record notes with an
optional page number, and mark it finished when you are done. Multi-line input
creates one note per non-empty line. Notes are grouped by day and can be
edited, deleted, and searched once a book has more than four notes. Finished
books can be moved back to the reading shelf.

Book notes also appear on the Calendar and contribute to Review activity.

## Review

Review summarizes either the current week or current month from the data
already loaded by the app. It shows completion progress, thoughts captured,
book notes, finished books, activity by day and quadrant, older open carryover,
and the next open items by priority. Review is computed entirely in the
browser; it does not have a separate API or table.

## Installable app and offline behavior

Second Brain is a Progressive Web App. On a supported browser, use the
browser's **Install** or **Add to Home Screen** action after opening the app.
It launches in a standalone window and includes install icons for desktop and
mobile devices.

The service worker caches the app shell and static assets after the first
successful visit. Navigations use the network when available and fall back to
that cached shell offline. API responses are deliberately never cached, so
loading or changing thoughts, books, and notes still requires a network
connection. If the connection drops after data has loaded, the app keeps that
content readable and disables write controls until the connection returns.
The task canvas's small recovery drafts are the exception: they use browser
local storage to protect typing that happened immediately before a page was
backgrounded or closed. They are not a full offline copy of the app's data.

The first load has a dedicated loading screen. If that load or a later request
fails, the app keeps the failure in context and offers **Try again**. A dropped
connection has its own status banner rather than being presented as a generic
server failure.

## Design and accessibility

The interface uses an Apple-inspired editorial-minimal style: a self-hosted
Fraunces display face for expressive headings, the system sans-serif stack for
interface text, restrained monochrome surfaces, rounded cards, and semantic
color where state needs to be obvious. Loading, empty, offline, and error
presentation is shared through `components/UiState.tsx` so the same visual
language appears in every tab.

Motion from the `motion` package is used for navigation, entrances, layout
changes, progress, and feedback. The root motion configuration honors the
user's reduced-motion preference, and components with custom counters or
artwork also switch to non-animated behavior. Narrow layouts use a bottom tab
bar and enlarge frequently used controls to mobile-friendly touch targets.

## Local development

Requirements:

- Node.js 22.13 or newer
- npm

Install dependencies and start the Cloudflare-backed vinext development
server:

```bash
npm install
npm run dev
```

The app uses the `DB` D1 binding configured in `vite.config.ts`. Local Wrangler
and Miniflare state is kept under the ignored `.wrangler/` directory; no app
environment variables are required for the current single-user setup.

Available commands:

```bash
npm run dev          # start the development server
npm run build        # create the production build in dist/
npm run start        # serve an existing production build locally
npm test             # build, then run the rendered-HTML test
npm run lint         # lint the source tree
npm run db:generate  # generate Drizzle SQL from db/schema.ts
```

The database schema is created and migrated at runtime by `ensureSchema()` in
`db/index.ts`, which is the live source of truth. `db/schema.ts` mirrors the
same `thoughts`, `books`, and `book_notes` tables for Drizzle migration
generation.

## Deployment

The production target is Cloudflare Workers with a Cloudflare D1 database.
`vite.config.ts` supplies the `DB` binding and database ID during the build;
`wrangler.jsonc` supplies the Worker, asset, compatibility, and cache settings.
The build combines them in `dist/server/wrangler.json`.

The GitHub Actions workflow in `.github/workflows/deploy.yml` deploys every
push to `main`. Configure these repository secrets before using it:

- `CLOUDFLARE_API_TOKEN` with permission to deploy the Worker and use its D1
  database
- `CLOUDFLARE_ACCOUNT_ID` for the target account

To target a different D1 database, update `DATABASE_ID` and the database name
in `vite.config.ts` before building. A local authenticated manual deployment
uses the same generated configuration as CI:

```bash
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

The first API request in each Worker isolate runs `ensureSchema()` against the
bound database. Existing databases receive the additive task-notes column
automatically; existing thoughts start with an empty note.

> [!IMPORTANT]
> The app does not implement authentication. Every request uses the fixed
> `OWNER_ID` in `app/api/shared.ts`, so protect any public deployment at the
> Cloudflare edge (or add authentication) before storing private information.

## Repository layout

```text
app/                    Next-style routes, API handlers, metadata, and global CSS
components/             Client UI, tab views, animation, shared states, and PWA registration
db/                     Runtime D1 schema management and Drizzle schema mirror
drizzle/                Generated Drizzle migration snapshot
lib/                    Shared date, quadrant, animation, and data types
public/                 PWA manifest, service worker, icons, and static artwork
tests/                   Production-worker rendered-HTML test
worker/                  Cloudflare Worker entry point and image optimization
work/markdown-notes/     Separate, ignored certificate-notes CLI workspace
```
