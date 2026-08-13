import { env } from "cloudflare:workers";
import { ensureSchema, getD1 } from "@/db";

type DailyNoteRow = {
  note_date: string;
  focus: string;
  learned: string;
  takeaways: string;
  questions: string;
  tomorrow: string;
  tags: string;
  minutes: number;
  updated_at: string;
};

function isValidDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function constantTimeEquals(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function isAuthorized(request: Request): boolean {
  const supplied = request.headers.get("x-daily-export-key") ?? "";
  const configured = env.DAILY_EXPORT_KEY ?? "";
  if (configured) return constantTimeEquals(supplied, configured);

  const hostname = new URL(request.url).hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  return isLocal && supplied === "local-preview-export-key";
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderMarkdown(note: DailyNoteRow): string {
  const tags = note.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${note.note_date}T12:00:00Z`));

  const lines = [
    "---",
    `date: ${note.note_date}`,
    `focus: ${yamlString(note.focus)}`,
    `minutes: ${note.minutes}`,
    `tags: [${tags.map(yamlString).join(", ")}]`,
    `updated_at: ${yamlString(note.updated_at)}`,
    "---",
    "",
    `# ${date}`,
  ];

  if (note.focus) lines.push("", `> ${note.focus}`);

  const sections = [
    ["What I learned", note.learned],
    ["Key takeaways", note.takeaways],
    ["Still unclear", note.questions],
    ["Tomorrow's focus", note.tomorrow],
  ];
  for (const [heading, content] of sections) {
    if (content) lines.push("", `## ${heading}`, "", content);
  }

  lines.push("");
  return lines.join("\n");
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const noteDate = new URL(request.url).searchParams.get("date");
  if (!isValidDate(noteDate)) {
    return Response.json({ error: "A valid date is required." }, { status: 400 });
  }

  try {
    await ensureSchema();
    const note = await getD1()
      .prepare(`SELECT note_date, focus, learned, takeaways, questions,
          tomorrow, tags, minutes, updated_at
        FROM daily_notes
        WHERE note_date = ?
        ORDER BY updated_at DESC
        LIMIT 1`)
      .bind(noteDate)
      .first<DailyNoteRow>();

    const hasContent =
      note &&
      [note.focus, note.learned, note.takeaways, note.questions, note.tomorrow, note.tags]
        .some((value) => value.trim()) || Boolean(note?.minutes);

    if (!note || !hasContent) {
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "no-store" },
      });
    }

    return new Response(renderMarkdown(note), {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${noteDate}.md"`,
        "content-type": "text/markdown; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Daily export error", error);
    return Response.json(
      { error: "The daily note could not be exported." },
      { status: 500 },
    );
  }
}
