export const MAX_ROWS = 3000;
export const MAX_CAPTURE_LINES = 50;
export const MAX_ROW_LENGTH = 4000;
export const MAX_TASK_NOTES_LENGTH = 100000;
export const MAX_TITLE_LENGTH = 300;
export const MAX_PAGE_LENGTH = 40;
export const MAX_NOTES_PER_BOOK = 1000;

// Single-user app: every request maps to the one owner. If this ever grows real
// accounts, resolve identity here (e.g. from a header set by an auth proxy).
export const OWNER_ID = "local-preview-user";

export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function captureLines(value: unknown): string[] {
  return text(value)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Reject over-limit captures instead of silently dropping lines or characters,
// so the client keeps the full input and can surface the reason.
export function captureError(lines: string[]): string | null {
  if (!lines.length) return "Write something first.";
  if (lines.length > MAX_CAPTURE_LINES) return `Too many lines at once: keep it to ${MAX_CAPTURE_LINES}.`;
  if (lines.some((line) => line.length > MAX_ROW_LENGTH)) {
    return `A line is too long: ${MAX_ROW_LENGTH} characters max.`;
  }
  return null;
}

// Parse a JSON body, returning null on malformed input so handlers can answer
// 400 rather than falling through to the generic 500.
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Each line of a dump needs its own millisecond so a batch reads back in the
// order it was written.
export function stagger(count: number): string[] {
  const start = Date.now();
  return Array.from({ length: count }, (_, index) => new Date(start + index).toISOString());
}

export function failure(label: string, error: unknown) {
  console.error(`${label} error`, error);
  return Response.json(
    { error: "That is temporarily unavailable. Please try again." },
    { status: 500 },
  );
}
