import { ensureSchema, getD1 } from "@/db";
import {
  MAX_NOTES_PER_BOOK,
  MAX_PAGE_LENGTH,
  MAX_ROWS,
  OWNER_ID,
  captureError,
  captureLines,
  failure,
  readJsonBody,
  stagger,
  text,
  validDate,
} from "@/app/api/shared";

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

export async function GET() {
  try {
    await ensureSchema();
    // Cap notes per book (a window over each book_id) so a book with many notes
    // can never crowd older books out of the shared list; MAX_ROWS is a backstop.
    const result = await getD1()
      .prepare(`SELECT ${COLUMNS} FROM (
          SELECT ${COLUMNS},
            ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY created_at DESC) AS rn
          FROM book_notes WHERE user_id = ?
        ) WHERE rn <= ?
        ORDER BY created_at DESC
        LIMIT ?`)
      .bind(OWNER_ID, MAX_NOTES_PER_BOOK, MAX_ROWS)
      .all<BookNoteRow>();
    return Response.json({ notes: result.results.map(serialize) });
  } catch (error) {
    return failure("Book notes", error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await readJsonBody(request);
    if (!payload) return Response.json({ error: "Send a valid JSON body." }, { status: 400 });
    const bookId = text(payload.bookId);
    if (!bookId) return Response.json({ error: "A book is required." }, { status: 400 });
    if (!validDate(payload.dayKey)) {
      return Response.json({ error: "A valid capture date is required." }, { status: 400 });
    }
    const lines = captureLines(payload.text);
    const problem = captureError(lines);
    if (problem) return Response.json({ error: problem }, { status: 400 });
    const page = text(payload.page);
    if (page.length > MAX_PAGE_LENGTH) {
      return Response.json({ error: `Page is too long: ${MAX_PAGE_LENGTH} characters max.` }, { status: 400 });
    }

    await ensureSchema();
    const db = getD1();
    const book = await db
      .prepare("SELECT id FROM books WHERE id = ? AND user_id = ?")
      .bind(bookId, OWNER_ID)
      .first<{ id: string }>();
    if (!book) return Response.json({ error: "Book not found." }, { status: 404 });

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
            OWNER_ID,
            bookId,
            body,
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
  try {
    const payload = await readJsonBody(request);
    if (!payload) return Response.json({ error: "Send a valid JSON body." }, { status: 400 });
    const id = text(payload.id);
    if (!id) return Response.json({ error: "A note id is required." }, { status: 400 });

    await ensureSchema();
    const db = getD1();
    const current = await db
      .prepare(`SELECT ${COLUMNS} FROM book_notes WHERE id = ? AND user_id = ?`)
      .bind(id, OWNER_ID)
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
        OWNER_ID,
      )
      .first<BookNoteRow>();
    if (!row) throw new Error("The note was not returned after update.");
    return Response.json({ note: serialize(row) });
  } catch (error) {
    return failure("Book notes", error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "A note id is required." }, { status: 400 });
    await ensureSchema();
    const result = await getD1()
      .prepare("DELETE FROM book_notes WHERE id = ? AND user_id = ?")
      .bind(id, OWNER_ID)
      .run();
    if (!result.meta.changes) return Response.json({ error: "Note not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return failure("Book notes", error);
  }
}
