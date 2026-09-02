import { ensureSchema, getD1 } from "@/db";
import { isQuadrant } from "@/lib/quadrants";
import {
  MAX_ROWS,
  MAX_TASK_NOTES_LENGTH,
  OWNER_ID,
  captureError,
  captureLines,
  failure,
  json,
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
  scheduled_day_key: string | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, body, notes, quadrant, status, day_key, scheduled_day_key, done_at, created_at, updated_at";

function serialize(row: ThoughtRow) {
  return {
    id: row.id,
    body: row.body,
    notes: row.notes,
    quadrant: row.quadrant,
    done: row.status === "done",
    capturedDayKey: row.day_key,
    scheduledDayKey: row.scheduled_day_key,
    // Cached versions of the PWA used `dayKey` as an editable task date. Keep
    // returning it during the transition so those clients can still render;
    // new clients use the two explicit fields above.
    dayKey: row.scheduled_day_key ?? row.day_key,
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
    return json({ thoughts: result.results.map(serialize) });
  } catch (error) {
    return failure("Thoughts", error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await readJsonBody(request);
    if (!payload) return json({ error: "Send a valid JSON body." }, { status: 400 });
    const capturedDayKey = validDate(payload.capturedDayKey)
      ? payload.capturedDayKey
      : validDate(payload.dayKey)
        ? payload.dayKey
        : "";
    if (!capturedDayKey) {
      return json({ error: "A valid capture date is required." }, { status: 400 });
    }
    if (!isQuadrant(payload.quadrant)) {
      return json({ error: "Pick where this belongs first." }, { status: 400 });
    }
    const lines = captureLines(payload.text);
    const problem = captureError(lines);
    if (problem) return json({ error: problem }, { status: 400 });

    await ensureSchema();
    const db = getD1();
    const timestamps = stagger(lines.length);
    const results = await db.batch<ThoughtRow>(
      lines.map((body, index) =>
        db
          .prepare(`INSERT INTO thoughts (
              id, user_id, body, notes, quadrant, status, day_key, scheduled_day_key, done_at, created_at, updated_at
            ) VALUES (?, ?, ?, '', ?, 'open', ?, NULL, NULL, ?, ?)
            RETURNING ${COLUMNS}`)
          .bind(
            crypto.randomUUID(),
            OWNER_ID,
            body,
            payload.quadrant,
            capturedDayKey,
            timestamps[index],
            timestamps[index],
          ),
      ),
    );
    return json(
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
    if (!payload) return json({ error: "Send a valid JSON body." }, { status: 400 });
    const id = text(payload.id);
    if (!id) return json({ error: "A thought id is required." }, { status: 400 });
    if (typeof payload.notes === "string" && payload.notes.length > MAX_TASK_NOTES_LENGTH) {
      return json(
        { error: `Task notes cannot exceed ${MAX_TASK_NOTES_LENGTH.toLocaleString("en-US")} characters.` },
        { status: 400 },
      );
    }
    const hasScheduledDayKey = Object.prototype.hasOwnProperty.call(payload, "scheduledDayKey");
    const hasLegacyDayKey = Object.prototype.hasOwnProperty.call(payload, "dayKey");
    if (
      hasScheduledDayKey &&
      payload.scheduledDayKey !== null &&
      !validDate(payload.scheduledDayKey)
    ) {
      return json({ error: "Choose a valid scheduled date or clear it." }, { status: 400 });
    }
    if (!hasScheduledDayKey && hasLegacyDayKey && !validDate(payload.dayKey)) {
      return json({ error: "Choose a valid scheduled date." }, { status: 400 });
    }

    await ensureSchema();
    const db = getD1();
    const current = await db
      .prepare(`SELECT ${COLUMNS} FROM thoughts WHERE id = ? AND user_id = ?`)
      .bind(id, OWNER_ID)
      .first<ThoughtRow>();
    if (!current) return json({ error: "Thought not found." }, { status: 404 });

    const timestamp = new Date().toISOString();
    const done = typeof payload.done === "boolean" ? payload.done : current.status === "done";

    const notes = typeof payload.notes === "string" ? payload.notes : current.notes;
    const scheduledDayKey = hasScheduledDayKey
      ? payload.scheduledDayKey === null
        ? null
        : payload.scheduledDayKey as string
      : hasLegacyDayKey && validDate(payload.dayKey)
        ? payload.dayKey
        : current.scheduled_day_key;

    const row = await db
      .prepare(`UPDATE thoughts SET body = ?, notes = ?, quadrant = ?, status = ?, scheduled_day_key = ?, done_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        RETURNING ${COLUMNS}`)
      .bind(
        text(payload.body, current.body).slice(0, 4000) || current.body,
        notes,
        isQuadrant(payload.quadrant) ? payload.quadrant : current.quadrant,
        done ? "done" : "open",
        scheduledDayKey,
        done ? (current.done_at ?? timestamp) : null,
        timestamp,
        id,
        OWNER_ID,
      )
      .first<ThoughtRow>();
    if (!row) throw new Error("The thought was not returned after update.");
    return json({ thought: serialize(row) });
  } catch (error) {
    return failure("Thoughts", error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return json({ error: "A thought id is required." }, { status: 400 });
    await ensureSchema();
    const result = await getD1()
      .prepare("DELETE FROM thoughts WHERE id = ? AND user_id = ?")
      .bind(id, OWNER_ID)
      .run();
    if (!result.meta.changes) return json({ error: "Thought not found." }, { status: 404 });
    return json({ deleted: true });
  } catch (error) {
    return failure("Thoughts", error);
  }
}
