import { ensureSchema, getD1 } from "@/db";
import { MAX_ROWS, apiUserId, captureLines, failure, stagger, text, validDate } from "@/app/api/shared";

type BookNoteRow = {
  id: string;
  book_id: string;
  body: string;
  page: string;
  day_key: string;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, book_id, body, page, day_key, created_at, updated_at";

function serialize(row: BookNoteRow) {
  return {
    id: row.id,
    bookId: row.book_id,
    body: row.body,
    page: row.page,
    dayKey: row.day_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to view your notes." }, { status: 401 });
  try {
    await ensureSchema();
    const result = await getD1()
      .prepare(`SELECT ${COLUMNS} FROM book_notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
      .bind(userId, MAX_ROWS)
      .all<BookNoteRow>();
    return Response.json({ notes: result.results.map(serialize) });
  } catch (error) {
    return failure("Book notes", error);
  }
}

export async function POST(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to add a note." }, { status: 401 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const bookId = text(payload.bookId);
    if (!bookId) return Response.json({ error: "A book is required." }, { status: 400 });
    if (!validDate(payload.dayKey)) {
      return Response.json({ error: "A valid capture date is required." }, { status: 400 });
    }
    const lines = captureLines(payload.text);
    if (!lines.length) return Response.json({ error: "Write something first." }, { status: 400 });

    await ensureSchema();
    const db = getD1();
    const book = await db
      .prepare("SELECT id FROM books WHERE id = ? AND user_id = ?")
      .bind(bookId, userId)
      .first<{ id: string }>();
    if (!book) return Response.json({ error: "Book not found." }, { status: 404 });

    const page = text(payload.page).slice(0, 40);
    const timestamps = stagger(lines.length);
    const results = await db.batch<BookNoteRow>(
      lines.map((body, index) =>
        db
          .prepare(`INSERT INTO book_notes (
              id, user_id, book_id, body, page, day_key, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING ${COLUMNS}`)
          .bind(
            crypto.randomUUID(),
            userId,
            bookId,
            body.slice(0, 4000),
            page,
            payload.dayKey,
            timestamps[index],
            timestamps[index],
          ),
      ),
    );
    return Response.json(
      { notes: results.flatMap((result) => result.results.map(serialize)) },
      { status: 201 },
    );
  } catch (error) {
    return failure("Book notes", error);
  }
}

export async function PATCH(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to update a note." }, { status: 401 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = text(payload.id);
    if (!id) return Response.json({ error: "A note id is required." }, { status: 400 });

    await ensureSchema();
    const db = getD1();
    const current = await db
      .prepare(`SELECT ${COLUMNS} FROM book_notes WHERE id = ? AND user_id = ?`)
      .bind(id, userId)
      .first<BookNoteRow>();
    if (!current) return Response.json({ error: "Note not found." }, { status: 404 });

    const row = await db
      .prepare(`UPDATE book_notes SET body = ?, page = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        RETURNING ${COLUMNS}`)
      .bind(
        text(payload.body, current.body).slice(0, 4000) || current.body,
        text(payload.page, current.page).slice(0, 40),
        new Date().toISOString(),
        id,
        userId,
      )
      .first<BookNoteRow>();
    if (!row) throw new Error("The note was not returned after update.");
    return Response.json({ note: serialize(row) });
  } catch (error) {
    return failure("Book notes", error);
  }
}

export async function DELETE(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to delete a note." }, { status: 401 });
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "A note id is required." }, { status: 400 });
    await ensureSchema();
    const result = await getD1()
      .prepare("DELETE FROM book_notes WHERE id = ? AND user_id = ?")
      .bind(id, userId)
      .run();
    if (!result.meta.changes) return Response.json({ error: "Note not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return failure("Book notes", error);
  }
}
