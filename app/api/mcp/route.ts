import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import {
  DELETE as deleteBookRoute,
  GET as getBooksRoute,
  PATCH as patchBookRoute,
  POST as postBookRoute,
} from "@/app/api/books/route";
import {
  DELETE as deleteNoteRoute,
  GET as getNotesRoute,
  PATCH as patchNoteRoute,
  POST as postNotesRoute,
} from "@/app/api/book-notes/route";
import {
  DELETE as deleteThoughtRoute,
  GET as getThoughtsRoute,
  PATCH as patchThoughtRoute,
  POST as postThoughtsRoute,
} from "@/app/api/thoughts/route";
import { QUADRANTS, QUADRANT_AXES } from "@/lib/quadrants";
import type { Book, BookNote, Thought } from "@/lib/types";

// Tools drive the same route handlers the browser uses, so capture splitting,
// the MAX_* limits, quadrant checks and owner scoping stay defined in one
// place. Only the request URL is synthetic; the handlers never read the host.
const ORIGIN = "https://second-brain.internal";

async function unwrap<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return payload;
}

function withBody(method: string, payload: unknown): Request {
  return new Request(ORIGIN, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function withId(id: string): Request {
  return new Request(`${ORIGIN}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

function reply(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

const DAY_KEY =
  "Local calendar date as YYYY-MM-DD. The worker runs in UTC, so pass the user's own local date instead of relying on the default.";

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

const quadrant = z
  .enum(QUADRANTS)
  .describe(
    Object.entries(QUADRANT_AXES)
      .map(([key, axis]) => `${key}: ${axis.toLowerCase()}`)
      .join("; "),
  );

const limit = z.number().int().min(1).max(200).default(50);

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function contains(haystack: string, needle: string | undefined): boolean {
  return !needle || haystack.toLowerCase().includes(needle.toLowerCase());
}

// A list can run to thousands of rows and long-form notes are the largest field
// on either table, so list results carry only enough to pick a row. The get_*
// tools return the full document.
function briefThought(thought: Thought) {
  return {
    id: thought.id,
    body: thought.body,
    quadrant: thought.quadrant,
    done: thought.done,
    capturedDayKey: thought.capturedDayKey,
    scheduledDayKey: thought.scheduledDayKey,
    notesLength: thought.notes.length,
  };
}

function briefNote(note: BookNote) {
  return {
    id: note.id,
    bookId: note.bookId,
    body: note.body,
    page: note.page,
    pageEnd: note.pageEnd,
    dayKey: note.dayKey,
    notesLength: note.notes.length,
  };
}

async function loadThoughts(): Promise<Thought[]> {
  const { thoughts } = await unwrap<{ thoughts: Thought[] }>(await getThoughtsRoute());
  return thoughts;
}

async function loadNotes(): Promise<BookNote[]> {
  const { notes } = await unwrap<{ notes: BookNote[] }>(await getNotesRoute());
  return notes;
}

async function findThought(id: string): Promise<Thought> {
  const thought = (await loadThoughts()).find((row) => row.id === id);
  if (!thought) throw new Error(`No thought with id ${id}.`);
  return thought;
}

function createServer(): McpServer {
  const server = new McpServer({ name: "second-brain", version: "1.0.0" });

  server.registerTool(
    "list_thoughts",
    {
      title: "List thoughts",
      description:
        "List tasks and thoughts from the Thoughts tab, newest first. Filters are combined with AND. Long-form notes are omitted; use get_thought for a single row's full content.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        quadrant: quadrant.optional(),
        status: z.enum(["open", "done", "all"]).default("open"),
        scheduledOn: dayKey.optional().describe("Only rows planned for exactly this date."),
        scheduledBefore: dayKey
          .optional()
          .describe("Only rows planned strictly before this date. Use with status 'open' to find overdue work."),
        capturedOn: dayKey.optional().describe("Only rows first written down on this date."),
        search: z.string().optional().describe("Case-insensitive substring match on the title and notes."),
        limit,
      }),
    },
    async ({ quadrant: only, status, scheduledOn, scheduledBefore, capturedOn, search, limit: max }) => {
      const thoughts = (await loadThoughts()).filter(
        (thought) =>
          (!only || thought.quadrant === only) &&
          (status === "all" || thought.done === (status === "done")) &&
          (!scheduledOn || thought.scheduledDayKey === scheduledOn) &&
          (!scheduledBefore || (thought.scheduledDayKey !== null && thought.scheduledDayKey < scheduledBefore)) &&
          (!capturedOn || thought.capturedDayKey === capturedOn) &&
          (contains(thought.body, search) || contains(thought.notes, search)),
      );
      return reply({
        total: thoughts.length,
        returned: Math.min(thoughts.length, max),
        thoughts: thoughts.slice(0, max).map(briefThought),
      });
    },
  );

  server.registerTool(
    "get_thought",
    {
      title: "Get a thought",
      description: "Read one thought in full, including its long-form notes.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => reply(await findThought(id)),
  );

  server.registerTool(
    "capture_thoughts",
    {
      title: "Capture thoughts",
      description:
        "Add one or more thoughts to a quadrant. Each non-empty line of text becomes its own row, at most 50 per call. Newly captured rows are open and unscheduled.",
      inputSchema: z.object({
        text: z.string().describe("One thought per line. Each line becomes a separate row."),
        quadrant,
        capturedDayKey: dayKey.optional().describe(DAY_KEY),
      }),
    },
    async ({ text, quadrant: target, capturedDayKey }) => {
      const { thoughts } = await unwrap<{ thoughts: Thought[] }>(
        await postThoughtsRoute(
          withBody("POST", {
            text,
            quadrant: target,
            capturedDayKey: capturedDayKey ?? utcToday(),
          }),
        ),
      );
      return reply({ created: thoughts.length, thoughts: thoughts.map(briefThought) });
    },
  );

  server.registerTool(
    "update_thought",
    {
      title: "Update a thought",
      description:
        "Change a thought's title, long-form notes, quadrant, or planned date. Omitted fields are left alone. The capture date is immutable and cannot be changed.",
      inputSchema: z.object({
        id: z.string(),
        body: z.string().optional().describe("The compact title shown in the matrix."),
        notes: z.string().optional().describe("Long-form notes. Replaces the existing notes entirely."),
        quadrant: quadrant.optional(),
        scheduledDayKey: dayKey
          .nullable()
          .optional()
          .describe(`Planned date, or null to unschedule. Omit to leave unchanged. ${DAY_KEY}`),
      }),
    },
    async ({ id, body, notes, quadrant: target, scheduledDayKey }) => {
      const payload: Record<string, unknown> = { id };
      if (body !== undefined) payload.body = body;
      if (notes !== undefined) payload.notes = notes;
      if (target !== undefined) payload.quadrant = target;
      if (scheduledDayKey !== undefined) payload.scheduledDayKey = scheduledDayKey;
      const { thought } = await unwrap<{ thought: Thought }>(
        await patchThoughtRoute(withBody("PATCH", payload)),
      );
      return reply(thought);
    },
  );

  server.registerTool(
    "complete_thought",
    {
      title: "Complete or reopen a thought",
      description:
        "Mark a thought done or open again. Completing stamps the completion time that the Review tab counts.",
      inputSchema: z.object({
        id: z.string(),
        done: z.boolean().default(true).describe("False reopens the thought and clears its completion time."),
      }),
    },
    async ({ id, done }) => {
      const { thought } = await unwrap<{ thought: Thought }>(
        await patchThoughtRoute(withBody("PATCH", { id, done })),
      );
      return reply(briefThought(thought));
    },
  );

  server.registerTool(
    "delete_thought",
    {
      title: "Delete a thought",
      description: "Permanently delete one thought and its notes. Prefer complete_thought for finished work.",
      annotations: { destructiveHint: true },
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => {
      await unwrap(await deleteThoughtRoute(withId(id)));
      return reply({ deleted: id });
    },
  );

  server.registerTool(
    "list_books",
    {
      title: "List books",
      description: "List books from the Books tab, newest first, with a count of the notes attached to each.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        status: z.enum(["reading", "finished", "all"]).default("all"),
        search: z.string().optional().describe("Case-insensitive substring match on the title."),
      }),
    },
    async ({ status, search }) => {
      const [{ books }, notes] = await Promise.all([
        unwrap<{ books: Book[] }>(await getBooksRoute()),
        loadNotes(),
      ]);
      const matching = books.filter(
        (book) =>
          (status === "all" || (book.finishedAt !== null) === (status === "finished")) &&
          contains(book.title, search),
      );
      return reply({
        books: matching.map((book) => ({
          ...book,
          noteCount: notes.filter((note) => note.bookId === book.id).length,
        })),
      });
    },
  );

  server.registerTool(
    "add_book",
    {
      title: "Add a book",
      description: "Add a book to the reading list.",
      inputSchema: z.object({
        title: z.string(),
        link: z.string().optional().describe("Optional URL for the book."),
      }),
    },
    async ({ title, link }) => {
      const { book } = await unwrap<{ book: Book }>(
        await postBookRoute(withBody("POST", { title, link: link ?? "" })),
      );
      return reply(book);
    },
  );

  server.registerTool(
    "update_book",
    {
      title: "Update a book",
      description: "Change a book's title or link, or mark it finished or unfinished. Omitted fields are left alone.",
      inputSchema: z.object({
        id: z.string(),
        title: z.string().optional(),
        link: z.string().optional(),
        finished: z.boolean().optional().describe("True stamps the finish time; false clears it."),
      }),
    },
    async ({ id, title, link, finished }) => {
      const payload: Record<string, unknown> = { id };
      if (title !== undefined) payload.title = title;
      if (link !== undefined) payload.link = link;
      if (finished !== undefined) payload.finished = finished;
      const { book } = await unwrap<{ book: Book }>(await patchBookRoute(withBody("PATCH", payload)));
      return reply(book);
    },
  );

  server.registerTool(
    "delete_book",
    {
      title: "Delete a book",
      description:
        "Permanently delete a book AND every reading note attached to it. This cannot be undone; confirm with the user first.",
      annotations: { destructiveHint: true },
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => {
      await unwrap(await deleteBookRoute(withId(id)));
      return reply({ deleted: id });
    },
  );

  server.registerTool(
    "list_book_notes",
    {
      title: "List reading notes",
      description:
        "List reading notes, newest first. Long-form content is omitted; use get_book_note for a single note's full text.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        bookId: z.string().optional().describe("Only notes belonging to this book."),
        search: z.string().optional().describe("Case-insensitive substring match on the main idea and content."),
        limit,
      }),
    },
    async ({ bookId, search, limit: max }) => {
      const notes = (await loadNotes()).filter(
        (note) =>
          (!bookId || note.bookId === bookId) &&
          (contains(note.body, search) || contains(note.notes, search)),
      );
      return reply({
        total: notes.length,
        returned: Math.min(notes.length, max),
        notes: notes.slice(0, max).map(briefNote),
      });
    },
  );

  server.registerTool(
    "get_book_note",
    {
      title: "Get a reading note",
      description: "Read one reading note in full, including its long-form content.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => {
      const note = (await loadNotes()).find((row) => row.id === id);
      if (!note) throw new Error(`No reading note with id ${id}.`);
      return reply(note);
    },
  );

  server.registerTool(
    "capture_book_notes",
    {
      title: "Capture reading notes",
      description:
        "Add one or more notes to a book. Each non-empty line of text becomes its own note, at most 50 per call.",
      inputSchema: z.object({
        bookId: z.string(),
        text: z.string().describe("One main idea per line. Each line becomes a separate note."),
        dayKey: dayKey.optional().describe(DAY_KEY),
        page: z.string().optional().describe("Starting page, 40 characters max."),
        pageEnd: z.string().optional().describe("Ending page, 40 characters max."),
      }),
    },
    async ({ bookId, text, dayKey: captured, page, pageEnd }) => {
      const { notes } = await unwrap<{ notes: BookNote[] }>(
        await postNotesRoute(
          withBody("POST", {
            bookId,
            text,
            dayKey: captured ?? utcToday(),
            page: page ?? "",
            pageEnd: pageEnd ?? "",
          }),
        ),
      );
      return reply({ created: notes.length, notes: notes.map(briefNote) });
    },
  );

  server.registerTool(
    "update_book_note",
    {
      title: "Update a reading note",
      description:
        "Change a reading note's main idea, long-form content, or pages. Omitted fields are left alone.",
      inputSchema: z.object({
        id: z.string(),
        body: z.string().optional().describe("The compact main idea."),
        notes: z.string().optional().describe("Long-form content. Replaces the existing content entirely."),
        page: z.string().optional(),
        pageEnd: z.string().optional(),
      }),
    },
    async ({ id, body, notes, page, pageEnd }) => {
      const payload: Record<string, unknown> = { id };
      if (body !== undefined) payload.body = body;
      if (notes !== undefined) payload.notes = notes;
      if (page !== undefined) payload.page = page;
      if (pageEnd !== undefined) payload.pageEnd = pageEnd;
      const { note } = await unwrap<{ note: BookNote }>(await patchNoteRoute(withBody("PATCH", payload)));
      return reply(note);
    },
  );

  server.registerTool(
    "delete_book_note",
    {
      title: "Delete a reading note",
      description: "Permanently delete one reading note.",
      annotations: { destructiveHint: true },
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => {
      await unwrap(await deleteNoteRoute(withId(id)));
      return reply({ deleted: id });
    },
  );

  return server;
}

const handler = createMcpHandler(createServer, { route: "/api/mcp" });

// Workers Caching fronts the whole worker and stores any 200 without freshness
// headers, so MCP replies carry the same no-store rule as the other API routes.
async function serve(request: Request): Promise<Response> {
  const response = await handler.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
