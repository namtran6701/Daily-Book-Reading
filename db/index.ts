import { env } from "cloudflare:workers";

let schemaPromise: Promise<void> | null = null;

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error("The study database is unavailable.");
  }
  return env.DB;
}

export async function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  const db = getD1();
  schemaPromise = (async () => {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        section TEXT NOT NULL DEFAULT 'General',
        summary TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        key_takeaways TEXT NOT NULL DEFAULT '',
        exam_traps TEXT NOT NULL DEFAULT '',
        recall_questions TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'learning',
        confidence INTEGER NOT NULL DEFAULT 1,
        review_count INTEGER NOT NULL DEFAULT 0,
        last_reviewed TEXT,
        next_review TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_chapters_user_updated
        ON chapters(user_id, updated_at)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_chapters_user_review
        ON chapters(user_id, next_review)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS daily_notes (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        note_date TEXT NOT NULL,
        focus TEXT NOT NULL DEFAULT '',
        learned TEXT NOT NULL DEFAULT '',
        takeaways TEXT NOT NULL DEFAULT '',
        questions TEXT NOT NULL DEFAULT '',
        tomorrow TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '',
        minutes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_notes_user_date_unique
        ON daily_notes(user_id, note_date)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_notes_user_updated
        ON daily_notes(user_id, updated_at)`),
    ]);
    await db.prepare("PRAGMA optimize").run();
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}
