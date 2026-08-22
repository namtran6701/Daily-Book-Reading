import { ensureSchema, getD1 } from "@/db";
import { MAX_ROWS, OWNER_ID, failure, text } from "@/app/api/shared";

type BookRow = {
  id: string;
  title: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, title, finished_at, created_at, updated_at";

function serialize(row: BookRow) {
  return {
    id: row.id,
    title: row.title,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const userId = OWNER_ID;
  try {
    await ensureSchema();
    const result = await getD1()
      .prepare(`SELECT ${COLUMNS} FROM books WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
      .bind(userId, MAX_ROWS)
      .all<BookRow>();
    return Response.json({ books: result.results.map(serialize) });
  } catch (error) {
    return failure("Books", error);
  }
}

export async function POST(request: Request) {
  const userId = OWNER_ID;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const title = text(payload.title).slice(0, 300);
    if (!title) return Response.json({ error: "A book needs a title." }, { status: 400 });

    await ensureSchema();
    const timestamp = new Date().toISOString();
    const row = await getD1()
      .prepare(`INSERT INTO books (id, user_id, title, finished_at, created_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, ?)
        RETURNING ${COLUMNS}`)
      .bind(crypto.randomUUID(), userId, title, timestamp, timestamp)
      .first<BookRow>();
    if (!row) throw new Error("The book was not returned after insert.");
    return Response.json({ book: serialize(row) }, { status: 201 });
  } catch (error) {
    return failure("Books", error);
  }
}

export async function PATCH(request: Request) {
  const userId = OWNER_ID;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = text(payload.id);
    if (!id) return Response.json({ error: "A book id is required." }, { status: 400 });

    await ensureSchema();
    const db = getD1();
    const current = await db
      .prepare(`SELECT ${COLUMNS} FROM books WHERE id = ? AND user_id = ?`)
      .bind(id, userId)
      .first<BookRow>();
    if (!current) return Response.json({ error: "Book not found." }, { status: 404 });

    const timestamp = new Date().toISOString();
    const finished =
      typeof payload.finished === "boolean" ? payload.finished : current.finished_at !== null;

    const row = await db
      .prepare(`UPDATE books SET title = ?, finished_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        RETURNING ${COLUMNS}`)
      .bind(
        text(payload.title, current.title).slice(0, 300) || current.title,
        finished ? (current.finished_at ?? timestamp) : null,
        timestamp,
        id,
        userId,
      )
      .first<BookRow>();
    if (!row) throw new Error("The book was not returned after update.");
    return Response.json({ book: serialize(row) });
  } catch (error) {
    return failure("Books", error);
  }
}

export async function DELETE(request: Request) {
  const userId = OWNER_ID;
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "A book id is required." }, { status: 400 });

    await ensureSchema();
    const db = getD1();
    const [, removal] = await db.batch([
      db.prepare("DELETE FROM book_notes WHERE book_id = ? AND user_id = ?").bind(id, userId),
      db.prepare("DELETE FROM books WHERE id = ? AND user_id = ?").bind(id, userId),
    ]);
    if (!removal.meta.changes) return Response.json({ error: "Book not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return failure("Books", error);
  }
}
