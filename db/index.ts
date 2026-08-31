import { env } from "cloudflare:workers";

let schemaPromise: Promise<void> | null = null;

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error("The database is unavailable.");
  }
  return env.DB;
}

async function columnNames(db: D1Database, table: string): Promise<Set<string>> {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set(result.results.map((column) => column.name));
}

// Thoughts predate the Eisenhower matrix: they carried a kind, free tags and a
// source instead of a quadrant. The tag and source text is folded back into the
// body so no words are lost, and the old columns are left in place rather than
// dropped. This runs once because the folding clears what it matches.
async function migrateThoughts(db: D1Database): Promise<void> {
  const columns = await columnNames(db, "thoughts");
  if (!columns.has("quadrant")) {
    await db.prepare("ALTER TABLE thoughts ADD COLUMN quadrant TEXT NOT NULL DEFAULT 'later'").run();
  }
  if (!columns.has("notes")) {
    await db.prepare("ALTER TABLE thoughts ADD COLUMN notes TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.has("scheduled_day_key")) {
    await db.prepare("ALTER TABLE thoughts ADD COLUMN scheduled_day_key TEXT").run();
  }
  if (columns.has("tags") && columns.has("source")) {
    await db
      .prepare(`UPDATE thoughts SET
          body = TRIM(
            body
            || CASE WHEN tags <> '' THEN ' #' || REPLACE(tags, ', ', ' #') ELSE '' END
            || CASE WHEN source <> '' THEN ' @' || source ELSE '' END
          ),
          tags = '',
          source = ''
        WHERE tags <> '' OR source <> ''`)
      .run();
  }
  // 'filed' was the resting status for reading notes, which no longer exist.
  await db.prepare("UPDATE thoughts SET status = 'open' WHERE status = 'filed'").run();
}

// Books used to carry an author, which the app no longer records or shows.
async function migrateBooks(db: D1Database): Promise<void> {
  const columns = await columnNames(db, "books");
  if (columns.has("author")) {
    await db.prepare("ALTER TABLE books DROP COLUMN author").run();
  }
  if (!columns.has("link")) {
    await db.prepare("ALTER TABLE books ADD COLUMN link TEXT NOT NULL DEFAULT ''").run();
  }
}

async function migrateBookNotes(db: D1Database): Promise<void> {
  const columns = await columnNames(db, "book_notes");
  if (!columns.has("notes")) {
    await db.prepare("ALTER TABLE book_notes ADD COLUMN notes TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.has("page_end")) {
    await db.prepare("ALTER TABLE book_notes ADD COLUMN page_end TEXT NOT NULL DEFAULT ''").run();
  }
}

export async function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  const db = getD1();
  schemaPromise = (async () => {
    await db.batch([
      // Legacy tables from the retired study-app incarnation, dropped for good.
      // IF EXISTS keeps this a no-op once they are gone.
      db.prepare("DROP TABLE IF EXISTS chapters"),
      db.prepare("DROP TABLE IF EXISTS daily_notes"),
      db.prepare(`CREATE TABLE IF NOT EXISTS thoughts (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        body TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        quadrant TEXT NOT NULL DEFAULT 'later',
        status TEXT NOT NULL DEFAULT 'open',
        day_key TEXT NOT NULL,
        scheduled_day_key TEXT,
        done_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_thoughts_user_day
        ON thoughts(user_id, day_key)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        link TEXT NOT NULL DEFAULT '',
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_books_user_created
        ON books(user_id, created_at)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS book_notes (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        body TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        page TEXT NOT NULL DEFAULT '',
        page_end TEXT NOT NULL DEFAULT '',
        day_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_book_notes_user_book
        ON book_notes(user_id, book_id, created_at)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_book_notes_user_day
        ON book_notes(user_id, day_key)`),
    ]);
    // The quadrant index waits until the migration has guaranteed the column,
    // which an older thoughts table will not have.
    await migrateThoughts(db);
    await migrateBooks(db);
    await migrateBookNotes(db);
    await db
      .prepare("CREATE INDEX IF NOT EXISTS idx_thoughts_user_quadrant ON thoughts(user_id, quadrant, status)")
      .run();
    await db
      .prepare("CREATE INDEX IF NOT EXISTS idx_thoughts_user_scheduled ON thoughts(user_id, scheduled_day_key)")
      .run();
    await db.prepare("PRAGMA optimize").run();
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}
