import { ensureSchema, getD1 } from "@/db";
import { isQuadrant } from "@/lib/quadrants";
import {
  MAX_ROWS,
  MAX_TASK_NOTES_LENGTH,
  OWNER_ID,
  captureError,
  captureLines,
  failure,
  readJsonBody,
  stagger,
  text,
  validDate,
} from "@/app/api/shared";

type ThoughtRow = {
  id: string;
  body: string;
  notes: string;
  quadrant: string;
  status: string;
  day_key: string;
  done_at: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, body, notes, quadrant, status, day_key, done_at, created_at, updated_at";

function serialize(row: ThoughtRow) {
  return {
    id: row.id,
    body: row.body,
    notes: row.notes,
    quadrant: row.quadrant,
    done: row.status === "done",
    dayKey: row.day_key,
    doneAt: row.done_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    await ensureSchema();
    const result = await getD1()
      .prepare(`SELECT ${COLUMNS} FROM thoughts
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?`)
      .bind(OWNER_ID, MAX_ROWS)
      .all<ThoughtRow>();
    return Response.json({ thoughts: result.results.map(serialize) });
  } catch (error) {
    return failure("Thoughts", error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await readJsonBody(request);
    if (!payload) return Response.json({ error: "Send a valid JSON body." }, { status: 400 });
    if (!validDate(payload.dayKey)) {
      return Response.json({ error: "A valid capture date is required." }, { status: 400 });
    }
    if (!isQuadrant(payload.quadrant)) {
      return Response.json({ error: "Pick where this belongs first." }, { status: 400 });
    }
    const lines = captureLines(payload.text);
    const problem = captureError(lines);
    if (problem) return Response.json({ error: problem }, { status: 400 });

    await ensureSchema();
    const db = getD1();
    const timestamps = stagger(lines.length);
    const results = await db.batch<ThoughtRow>(
      lines.map((body, index) =>
        db
          .prepare(`INSERT INTO thoughts (
              id, user_id, body, notes, quadrant, status, day_key, done_at, created_at, updated_at
            ) VALUES (?, ?, ?, '', ?, 'open', ?, NULL, ?, ?)
            RETURNING ${COLUMNS}`)
          .bind(
            crypto.randomUUID(),
            OWNER_ID,
            body,
            payload.quadrant,
            payload.dayKey,
            timestamps[index],
            timestamps[index],
          ),
      ),
    );
    return Response.json(
      { thoughts: results.flatMap((result) => result.results.map(serialize)) },
      { status: 201 },
    );
  } catch (error) {
    return failure("Thoughts", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await readJsonBody(request);
    if (!payload) return Response.json({ error: "Send a valid JSON body." }, { status: 400 });
    const id = text(payload.id);
    if (!id) return Response.json({ error: "A thought id is required." }, { status: 400 });
    if (typeof payload.notes === "string" && payload.notes.length > MAX_TASK_NOTES_LENGTH) {
      return Response.json(
        { error: `Task notes cannot exceed ${MAX_TASK_NOTES_LENGTH.toLocaleString("en-US")} characters.` },
        { status: 400 },
      );
    }

    await ensureSchema();
    const db = getD1();
    const current = await db
      .prepare(`SELECT ${COLUMNS} FROM thoughts WHERE id = ? AND user_id = ?`)
      .bind(id, OWNER_ID)
      .first<ThoughtRow>();
    if (!current) return Response.json({ error: "Thought not found." }, { status: 404 });

    const timestamp = new Date().toISOString();
    const done = typeof payload.done === "boolean" ? payload.done : current.status === "done";

    const notes = typeof payload.notes === "string" ? payload.notes : current.notes;
    const dayKey = validDate(payload.dayKey) ? payload.dayKey : current.day_key;

    const row = await db
      .prepare(`UPDATE thoughts SET body = ?, notes = ?, quadrant = ?, status = ?, day_key = ?, done_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        RETURNING ${COLUMNS}`)
      .bind(
        text(payload.body, current.body).slice(0, 4000) || current.body,
        notes,
        isQuadrant(payload.quadrant) ? payload.quadrant : current.quadrant,
        done ? "done" : "open",
        dayKey,
        done ? (current.done_at ?? timestamp) : null,
        timestamp,
        id,
        OWNER_ID,
      )
      .first<ThoughtRow>();
    if (!row) throw new Error("The thought was not returned after update.");
    return Response.json({ thought: serialize(row) });
  } catch (error) {
    return failure("Thoughts", error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "A thought id is required." }, { status: 400 });
    await ensureSchema();
    const result = await getD1()
      .prepare("DELETE FROM thoughts WHERE id = ? AND user_id = ?")
      .bind(id, OWNER_ID)
      .run();
    if (!result.meta.changes) return Response.json({ error: "Thought not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return failure("Thoughts", error);
  }
}
