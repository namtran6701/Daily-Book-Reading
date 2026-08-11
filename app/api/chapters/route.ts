import { ensureSchema, getD1 } from "@/db";

type ChapterRow = {
  id: string;
  user_id: string;
  title: string;
  section: string;
  summary: string;
  content: string;
  key_takeaways: string;
  exam_traps: string;
  recall_questions: string;
  tags: string;
  status: string;
  confidence: number;
  review_count: number;
  last_reviewed: string | null;
  next_review: string;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS = `id, user_id, title, section, summary, content,
  key_takeaways, exam_traps, recall_questions, tags, status, confidence,
  review_count, last_reviewed, next_review, created_at, updated_at`;

function apiUserId(request: Request): string | null {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (userId) return userId;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1"
    ? "local-preview-user"
    : null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const result = new Date(`${value}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function clampConfidence(value: unknown, fallback = 1): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(5, Math.max(1, Math.round(number))) : fallback;
}

function safeStatus(value: unknown, fallback = "learning"): string {
  return value === "learning" || value === "reviewing" || value === "mastered"
    ? value
    : fallback;
}

function serialize(row: ChapterRow) {
  return {
    id: row.id,
    title: row.title,
    section: row.section,
    summary: row.summary,
    content: row.content,
    keyTakeaways: row.key_takeaways,
    examTraps: row.exam_traps,
    recallQuestions: row.recall_questions,
    tags: row.tags,
    status: row.status,
    confidence: row.confidence,
    reviewCount: row.review_count,
    lastReviewed: row.last_reviewed,
    nextReview: row.next_review,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function errorResponse(error: unknown) {
  console.error("Chapter API error", error);
  return Response.json(
    { error: "Your study notes are temporarily unavailable. Please try again." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to view your notes." }, { status: 401 });
  try {
    await ensureSchema();
    const result = await getD1()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM chapters WHERE user_id = ? ORDER BY updated_at DESC`)
      .bind(userId)
      .all<ChapterRow>();
    return Response.json({ chapters: result.results.map(serialize) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to create notes." }, { status: 401 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const title = text(payload.title);
    if (!title) return Response.json({ error: "A chapter title is required." }, { status: 400 });

    await ensureSchema();
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const nextReview = addDays(today(), 1);
    const row = await getD1()
      .prepare(`INSERT INTO chapters (
          id, user_id, title, section, summary, content, key_takeaways,
          exam_traps, recall_questions, tags, status, confidence, review_count,
          last_reviewed, next_review, created_at, updated_at
        ) VALUES (?, ?, ?, ?, '', '', '', '', '', '', 'learning', 1, 0, NULL, ?, ?, ?)
        RETURNING ${SELECT_COLUMNS}`)
      .bind(id, userId, title, text(payload.section, "General") || "General", nextReview, timestamp, timestamp)
      .first<ChapterRow>();
    if (!row) throw new Error("The chapter was not returned after creation.");
    return Response.json({ chapter: serialize(row) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to update notes." }, { status: 401 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = text(payload.id);
    if (!id) return Response.json({ error: "A chapter id is required." }, { status: 400 });

    await ensureSchema();
    const db = getD1();
    const current = await db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM chapters WHERE id = ? AND user_id = ?`)
      .bind(id, userId)
      .first<ChapterRow>();
    if (!current) return Response.json({ error: "Chapter not found." }, { status: 404 });

    const timestamp = new Date().toISOString();
    const isReview = payload.action === "review";
    const confidence = clampConfidence(payload.confidence, current.confidence);
    const intervals = [1, 1, 3, 7, 14, 30];
    const title = isReview ? current.title : text(payload.title, current.title);
    if (!title) return Response.json({ error: "A chapter title is required." }, { status: 400 });

    const row = await db
      .prepare(`UPDATE chapters SET
          title = ?, section = ?, summary = ?, content = ?, key_takeaways = ?,
          exam_traps = ?, recall_questions = ?, tags = ?, status = ?, confidence = ?,
          review_count = ?, last_reviewed = ?, next_review = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        RETURNING ${SELECT_COLUMNS}`)
      .bind(
        title,
        isReview ? current.section : text(payload.section, current.section) || "General",
        isReview ? current.summary : text(payload.summary, current.summary),
        isReview ? current.content : text(payload.content, current.content),
        isReview ? current.key_takeaways : text(payload.keyTakeaways, current.key_takeaways),
        isReview ? current.exam_traps : text(payload.examTraps, current.exam_traps),
        isReview ? current.recall_questions : text(payload.recallQuestions, current.recall_questions),
        isReview ? current.tags : text(payload.tags, current.tags),
        isReview ? (confidence >= 5 ? "mastered" : "reviewing") : safeStatus(payload.status, current.status),
        confidence,
        isReview ? current.review_count + 1 : current.review_count,
        isReview ? today() : current.last_reviewed,
        isReview ? addDays(today(), intervals[confidence]) : current.next_review,
        timestamp,
        id,
        userId,
      )
      .first<ChapterRow>();
    if (!row) throw new Error("The chapter was not returned after update.");
    return Response.json({ chapter: serialize(row) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const userId = apiUserId(request);
  if (!userId) return Response.json({ error: "Please sign in to delete notes." }, { status: 401 });
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "A chapter id is required." }, { status: 400 });
    await ensureSchema();
    const result = await getD1()
      .prepare("DELETE FROM chapters WHERE id = ? AND user_id = ?")
      .bind(id, userId)
      .run();
    if (!result.meta.changes) return Response.json({ error: "Chapter not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
