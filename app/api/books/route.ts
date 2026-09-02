import { ensureSchema, getD1 } from "@/db";
import {
  MAX_LINK_LENGTH,
  MAX_ROWS,
  MAX_TITLE_LENGTH,
  OWNER_ID,
  failure,
  json,
  readJsonBody,
  text,
} from "@/app/api/shared";

type BookRow = {
  id: string;
  title: string;
  link: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, title, link, finished_at, created_at, updated_at";

function serialize(row: BookRow) {
  return {
    id: row.id,
    title: row.title,
    link: row.link,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    await ensureSchema();
    const result = await getD1()
      .prepare(`SELECT ${COLUMNS} FROM books WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
      .bind(OWNER_ID, MAX_ROWS)
      .all<BookRow>();
    return json({ books: result.results.map(serialize) });
  } catch (error) {
    return failure("Books", error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await readJsonBody(request);
    if (!payload) return json({ error: "Send a valid JSON body." }, { status: 400 });
    const title = text(payload.title);
    if (!title) return json({ error: "A book needs a title." }, { status: 400 });
    if (title.length > MAX_TITLE_LENGTH) {
      return json({ error: `A title is too long: ${MAX_TITLE_LENGTH} characters max.` }, { status: 400 });
    }

    await ensureSchema();
    const timestamp = new Date().toISOString();
    const row = await getD1()
      .prepare(`INSERT INTO books (id, user_id, title, link, finished_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?)
        RETURNING ${COLUMNS}`)
      .bind(
        crypto.randomUUID(),
        OWNER_ID,
        title,
        text(payload.link).slice(0, MAX_LINK_LENGTH),
        timestamp,
        timestamp,
      )
      .first<BookRow>();
    if (!row) throw new Error("The book was not returned after insert.");
    return json({ book: serialize(row) }, { status: 201 });
  } catch (error) {
    return failure("Books", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await readJsonBody(request);
    if (!payload) return json({ error: "Send a valid JSON body." }, { status: 400 });
    const id = text(payload.id);
    if (!id) return json({ error: "A book id is required." }, { status: 400 });

    await ensureSchema();
    const db = getD1();
    const current = await db
      .prepare(`SELECT ${COLUMNS} FROM books WHERE id = ? AND user_id = ?`)
      .bind(id, OWNER_ID)
      .first<BookRow>();
    if (!current) return json({ error: "Book not found." }, { status: 404 });

    const timestamp = new Date().toISOString();
    const finished =
      typeof payload.finished === "boolean" ? payload.finished : current.finished_at !== null;

    const row = await db
      .prepare(`UPDATE books SET title = ?, link = ?, finished_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        RETURNING ${COLUMNS}`)
      .bind(
        text(payload.title, current.title).slice(0, MAX_TITLE_LENGTH) || current.title,
        text(payload.link, current.link).slice(0, MAX_LINK_LENGTH),
        finished ? (current.finished_at ?? timestamp) : null,
        timestamp,
        id,
        OWNER_ID,
      )
      .first<BookRow>();
    if (!row) throw new Error("The book was not returned after update.");
    return json({ book: serialize(row) });
  } catch (error) {
    return failure("Books", error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return json({ error: "A book id is required." }, { status: 400 });

    await ensureSchema();
    const db = getD1();
    const [, removal] = await db.batch([
      db.prepare("DELETE FROM book_notes WHERE book_id = ? AND user_id = ?").bind(id, OWNER_ID),
      db.prepare("DELETE FROM books WHERE id = ? AND user_id = ?").bind(id, OWNER_ID),
    ]);
    if (!removal.meta.changes) return json({ error: "Book not found." }, { status: 404 });
    return json({ deleted: true });
  } catch (error) {
    return failure("Books", error);
  }
}
