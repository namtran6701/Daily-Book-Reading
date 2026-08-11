import { ensureSchema, getD1 } from "@/db";

type DailyNoteRow = {
  id: string;
  user_id: string;
  note_date: string;
  focus: string;
  learned: string;
  takeaways: string;
  questions: string;
  tomorrow: string;
  tags: string;
  minutes: number;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS = `id, user_id, note_date, focus, learned, takeaways,
  questions, tomorrow, tags, minutes, created_at, updated_at`;

function apiUserId(request: Request): string | null {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (userId) return userId;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1"
    ? "local-preview-user"
    : null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function safeMinutes(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1440, Math.max(0, Math.round(parsed))) : fallback;
}

function serialize(row: DailyNoteRow) {
  return {
    id: row.id,
    noteDate: row.note_date,
    focus: row.focus,
    learned: row.learned,
    takeaways: row.takeaways,
    questions: row.questions,
    tomorrow: row.tomorrow,
    tags: row.tags,
    minutes: row.minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function errorResponse(error: unknown) {
  console.error("Daily notes API error", error);
  return Response.json(
    { error: "Your learning log is temporarily unavailable. Please try again." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to view your learning log." }, { status: 401 });
  try {
    await ensureSchema();
    const result = await getD1()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM daily_notes WHERE user_id = ? ORDER BY note_date DESC`)
      .bind(userId)
      .all<DailyNoteRow>();
    return Response.json({ notes: result.results.map(serialize) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to create a daily note." }, { status: 401 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (!validDate(payload.noteDate)) {
      return Response.json({ error: "Choose a valid date." }, { status: 400 });
    }

    await ensureSchema();
    const timestamp = new Date().toISOString();
    const row = await getD1()
      .prepare(`INSERT INTO daily_notes (
          id, user_id, note_date, focus, learned, takeaways, questions,
          tomorrow, tags, minutes, created_at, updated_at
        ) VALUES (?, ?, ?, '', '', '', '', '', '', 0, ?, ?)
        ON CONFLICT(user_id, note_date) DO UPDATE SET note_date = excluded.note_date
        RETURNING ${SELECT_COLUMNS}`)
      .bind(crypto.randomUUID(), userId, payload.noteDate, timestamp, timestamp)
      .first<DailyNoteRow>();
    if (!row) throw new Error("The daily note was not returned after creation.");
    return Response.json({ note: serialize(row) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to update your daily note." }, { status: 401 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = text(payload.id);
    if (!id) return Response.json({ error: "A note id is required." }, { status: 400 });

    await ensureSchema();
    const db = getD1();
    const current = await db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM daily_notes WHERE id = ? AND user_id = ?`)
      .bind(id, userId)
      .first<DailyNoteRow>();
    if (!current) return Response.json({ error: "Daily note not found." }, { status: 404 });

    const row = await db
      .prepare(`UPDATE daily_notes SET
          focus = ?, learned = ?, takeaways = ?, questions = ?, tomorrow = ?,
          tags = ?, minutes = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        RETURNING ${SELECT_COLUMNS}`)
      .bind(
        text(payload.focus, current.focus),
        text(payload.learned, current.learned),
        text(payload.takeaways, current.takeaways),
        text(payload.questions, current.questions),
        text(payload.tomorrow, current.tomorrow),
        text(payload.tags, current.tags),
        safeMinutes(payload.minutes, current.minutes),
        new Date().toISOString(),
        id,
        userId,
      )
      .first<DailyNoteRow>();
    if (!row) throw new Error("The daily note was not returned after update.");
    return Response.json({ note: serialize(row) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to delete a daily note." }, { status: 401 });
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "A note id is required." }, { status: 400 });
    await ensureSchema();
    const result = await getD1()
      .prepare("DELETE FROM daily_notes WHERE id = ? AND user_id = ?")
      .bind(id, userId)
      .run();
    if (!result.meta.changes) return Response.json({ error: "Daily note not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
