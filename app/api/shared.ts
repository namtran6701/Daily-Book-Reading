export const MAX_ROWS = 3000;
export const MAX_CAPTURE_LINES = 50;

export function apiUserId(request: Request): string | null {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (userId) return userId;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" ? "local-preview-user" : null;
}

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
    .filter(Boolean)
    .slice(0, MAX_CAPTURE_LINES);
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
