"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type Transition,
} from "motion/react";
import { BooksTab } from "./BooksTab";
import { BookNoteDetail, type BookNoteUpdateOptions } from "./BookNoteDetail";
import { Briefing } from "./Briefing";
import { CalendarTab } from "./CalendarTab";
import { MatrixTab } from "./MatrixTab";
import { ReviewTab } from "./ReviewTab";
import { TaskDetail, type ThoughtUpdateOptions } from "./TaskDetail";
import { LoadingState, QuietState, StatusBanner } from "./UiState";
import { formatDate, localDateKey, monthKey, shiftMonth } from "@/lib/date-keys";
import { AlertIcon, BookGlyph, MatrixGlyph, OfflineIcon, ReviewGlyph, TodayIcon } from "./icons";
import type { Quadrant } from "@/lib/quadrants";
import { gentle, snappy } from "@/lib/springs";
import type { Book, BookNote, Thought } from "@/lib/types";

type Tab = "calendar" | "thoughts" | "books" | "review";

type AppError = {
  message: string;
  scope: string;
};

const TASK_QUERY = "task";
const TASK_HISTORY_KEY = "secondBrainTask";
const BOOK_NOTE_QUERY = "note";
const BOOK_NOTE_HISTORY_KEY = "secondBrainBookNote";

// Hand the motion to the browser: settle immediately, no animation of our own.
const INSTANT: Transition = { duration: 0 };

const TABS: { value: Tab; label: string; glyph: (props: { size?: number }) => React.JSX.Element }[] = [
  { value: "calendar", label: "Calendar", glyph: TodayIcon },
  { value: "thoughts", label: "Thoughts", glyph: MatrixGlyph },
  { value: "books", label: "Books", glyph: BookGlyph },
  { value: "review", label: "Review", glyph: ReviewGlyph },
];

function subscribeToNothing(): () => void {
  return () => {};
}

function subscribeToNetwork(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function readNetworkStatus(): boolean {
  return navigator.onLine;
}

function taskIdFromUrl(): string {
  return new URL(window.location.href).searchParams.get(TASK_QUERY) ?? "";
}

function bookNoteIdFromUrl(): string {
  return new URL(window.location.href).searchParams.get(BOOK_NOTE_QUERY) ?? "";
}

function taskUrl(id?: string): string {
  const url = new URL(window.location.href);
  url.searchParams.delete(BOOK_NOTE_QUERY);
  if (id) url.searchParams.set(TASK_QUERY, id);
  else url.searchParams.delete(TASK_QUERY);
  return `${url.pathname}${url.search}${url.hash}`;
}

function bookNoteUrl(id?: string): string {
  const url = new URL(window.location.href);
  url.searchParams.delete(TASK_QUERY);
  if (id) url.searchParams.set(BOOK_NOTE_QUERY, id);
  else url.searchParams.delete(BOOK_NOTE_QUERY);
  return `${url.pathname}${url.search}${url.hash}`;
}

// The Worker renders this component too, where a layout effect would warn and
// never run. Fall back to the passive effect there.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function historyStateWithoutDetail(): Record<string, unknown> {
  const current = history.state;
  const next = current && typeof current === "object" ? { ...current } : {};
  delete next[TASK_HISTORY_KEY];
  delete next[BOOK_NOTE_HISTORY_KEY];
  return next;
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? fallback);
  return payload;
}

// Cloudflare Access expires the session after a period of inactivity and then
// 302s same-origin API calls to its cross-origin login page. redirect: "manual"
// surfaces that as an opaque redirect (rather than a CORS error we could not
// tell apart from an offline blip), so we can reload and let the browser follow
// Access's login flow. The sessionStorage guard stops a reload that lands back
// on a cached shell from spinning.
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!navigator.onLine) {
    throw new Error("Changes need a connection. Reconnect and try again.");
  }
  const response = await fetch(input, { ...init, redirect: "manual" });
  if (response.type === "opaqueredirect") {
    let reloaded = false;
    try {
      reloaded = sessionStorage.getItem("sb-access-reload") === "1";
      if (!reloaded) sessionStorage.setItem("sb-access-reload", "1");
    } catch {
      // sessionStorage can be unavailable (private mode); the guard is best-effort.
    }
    if (!reloaded) window.location.reload();
    throw new Error("Your session expired. Refresh to sign in again.");
  }
  try {
    sessionStorage.removeItem("sb-access-reload");
  } catch {
    // sessionStorage can be unavailable (private mode); the guard is best-effort.
  }
  return response;
}

export function SecondBrain() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("calendar");
  const [tabDirection, setTabDirection] = useState(1);
  const [month, setMonth] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedBookId, setSelectedBookId] = useState("");
  const [selectedThoughtId, setSelectedThoughtId] = useState("");
  // Whether the last selection change came from the app or from the browser's
  // own back/forward, which decides if the views animate themselves.
  const [navigationSource, setNavigationSource] = useState<"app" | "history">("app");
  const [selectedBookNoteId, setSelectedBookNoteId] = useState("");
  const thoughtIds = useRef<Set<string>>(new Set());
  const bookNoteIds = useRef<Set<string>>(new Set());
  // Where the workspace was left when a detail opened, so returning lands back
  // on the same row rather than at the top of the list.
  const workspaceScroll = useRef(0);
  const detailOpen = useRef(false);
  // Ids whose DELETE is in flight. The row shows a spinner and only leaves the
  // list once the server confirms, so a failed delete can never resurrect a row.
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // The server runs in UTC and the browser does not, so the current date is
  // read on the client only. It stays empty through the server render.
  const today = useSyncExternalStore(subscribeToNothing, localDateKey, () => "");
  const online = useSyncExternalStore(subscribeToNetwork, readNetworkStatus, () => true);
  const activeDay = selectedDay || today;
  const activeMonth = month || (today ? monthKey(today) : "");

  const { scrollY } = useScroll();
  const wordmarkScale = useTransform(scrollY, [0, 72], [1, 0.78]);
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (value) => setScrolled(value > 8));

  const clearError = useCallback((scope: string) => {
    setError((current) => (current?.scope === scope ? null : current));
  }, []);

  const reportError = useCallback((scope: string, caught: unknown, fallback: string) => {
    setError({ scope, message: caught instanceof Error ? caught.message : fallback });
  }, []);

  const load = useCallback(async () => {
    try {
      const [thoughtsResponse, booksResponse, notesResponse] = await Promise.all([
        apiFetch("/api/thoughts", { cache: "no-store" }),
        apiFetch("/api/books", { cache: "no-store" }),
        apiFetch("/api/book-notes", { cache: "no-store" }),
      ]);
      setThoughts((await readJson<{ thoughts: Thought[] }>(thoughtsResponse, "Could not load your thoughts.")).thoughts);
      setBooks((await readJson<{ books: Book[] }>(booksResponse, "Could not load your books.")).books);
      setNotes((await readJson<{ notes: BookNote[] }>(notesResponse, "Could not load your notes.")).notes);
      setLoaded(true);
      clearError("load");
    } catch (caught) {
      reportError("load", caught, "Could not open your second brain.");
    } finally {
      setLoading(false);
    }
  }, [clearError, reportError]);

  useEffect(() => {
    // A one-shot fetch on mount: there is no external system to subscribe to.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const retryLoad = useCallback(() => {
    setError(null);
    setLoading(true);
    void load();
  }, [load]);

  // Delete the row only once the server confirms. The id spins in the meantime,
  // and a failed request leaves the row in place with an error rather than
  // removing it and hoping the request lands. `apply` prunes local state on
  // success; a 404 counts as success since the row is already gone server-side.
  const runDelete = useCallback(
    async (id: string, url: string, apply: () => void, message: string) => {
      const scope = `delete:${id}`;
      setDeletingIds((current) => new Set(current).add(id));
      try {
        const response = await apiFetch(url, { method: "DELETE" });
        // A 404 means it is already gone server-side, which is the outcome we want.
        if (!response.ok && response.status !== 404) throw new Error(message);
        apply();
        clearError(scope);
      } catch (caught) {
        reportError(scope, caught, message);
      } finally {
        setDeletingIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [clearError, reportError],
  );

  const captureThought = useCallback(
    async (text: string, quadrant: Quadrant) => {
      setBusy(true);
      try {
        const response = await apiFetch("/api/thoughts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, quadrant, capturedDayKey: today }),
        });
        const payload = await readJson<{ thoughts: Thought[] }>(response, "Could not keep that.");
        setThoughts((current) => [...payload.thoughts, ...current]);
        clearError("thought:capture");
        return true;
      } catch (caught) {
        reportError("thought:capture", caught, "Could not keep that.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [clearError, reportError, today],
  );

  const updateThought = useCallback(async (
    id: string,
    patch: Partial<Thought>,
    options?: ThoughtUpdateOptions,
  ) => {
    const scope = `thought:update:${id}`;
    setThoughts((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    try {
      const response = await apiFetch("/api/thoughts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
        keepalive: options?.keepalive,
      });
      const payload = await readJson<{ thought: Thought }>(response, "Could not update that thought.");
      setThoughts((current) => current.map((item) => (item.id === id ? payload.thought : item)));
      clearError(scope);
      return true;
    } catch (caught) {
      if (!options?.background) {
        reportError(scope, caught, "Could not update that thought.");
        void load();
      }
      return false;
    }
  }, [clearError, load, reportError]);

  const deleteThought = useCallback(
    (id: string) =>
      runDelete(
        id,
        `/api/thoughts?id=${encodeURIComponent(id)}`,
        () => setThoughts((current) => current.filter((item) => item.id !== id)),
        "Could not delete that thought.",
      ),
    [runDelete],
  );

  const addBook = useCallback(async (title: string) => {
    setBusy(true);
    try {
      const response = await apiFetch("/api/books", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const payload = await readJson<{ book: Book }>(response, "Could not add that book.");
      setBooks((current) => [payload.book, ...current]);
      clearError("book:add");
      return true;
    } catch (caught) {
      reportError("book:add", caught, "Could not add that book.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [clearError, reportError]);

  const updateBook = useCallback(async (id: string, patch: { finished?: boolean }) => {
    try {
      const response = await apiFetch("/api/books", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = await readJson<{ book: Book }>(response, "Could not update that book.");
      setBooks((current) => current.map((item) => (item.id === id ? payload.book : item)));
      clearError(`book:update:${id}`);
    } catch (caught) {
      reportError(`book:update:${id}`, caught, "Could not update that book.");
    }
  }, [clearError, reportError]);

  const deleteBook = useCallback(
    (id: string) =>
      runDelete(
        id,
        `/api/books?id=${encodeURIComponent(id)}`,
        () => {
          setSelectedBookId("");
          setBooks((current) => current.filter((item) => item.id !== id));
          setNotes((current) => current.filter((item) => item.bookId !== id));
        },
        "Could not delete that book.",
      ),
    [runDelete],
  );

  const addNote = useCallback(
    async (bookId: string, text: string) => {
      setBusy(true);
      try {
        const response = await apiFetch("/api/book-notes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bookId, text, page: "", pageEnd: "", dayKey: today }),
        });
        const payload = await readJson<{ notes: BookNote[] }>(response, "Could not save that note.");
        setNotes((current) => [...payload.notes, ...current]);
        clearError(`book-note:add:${bookId}`);
        return payload.notes[0] ?? null;
      } catch (caught) {
        reportError(`book-note:add:${bookId}`, caught, "Could not save that note.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [clearError, reportError, today],
  );

  const updateNote = useCallback(async (
    id: string,
    patch: Partial<BookNote>,
    options?: BookNoteUpdateOptions,
  ) => {
    setNotes((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    try {
      const response = await apiFetch("/api/book-notes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
        keepalive: options?.keepalive,
      });
      const payload = await readJson<{ note: BookNote }>(response, "Could not update that note.");
      setNotes((current) => current.map((item) => (item.id === id ? payload.note : item)));
      clearError(`book-note:update:${id}`);
      return true;
    } catch (caught) {
      if (!options?.background) {
        reportError(`book-note:update:${id}`, caught, "Could not update that note.");
        void load();
      }
      return false;
    }
  }, [clearError, load, reportError]);

  const deleteNote = useCallback(
    (id: string) =>
      runDelete(
        id,
        `/api/book-notes?id=${encodeURIComponent(id)}`,
        () => setNotes((current) => current.filter((item) => item.id !== id)),
        "Could not delete that note.",
      ),
    [runDelete],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- URL detail state is reconciled after API data arrives. */
  useEffect(() => {
    thoughtIds.current = new Set(thoughts.map((thought) => thought.id));
    bookNoteIds.current = new Set(notes.map((note) => note.id));
    if (!loaded) return;

    const requestedTask = taskIdFromUrl();
    const requestedBookNote = bookNoteIdFromUrl();
    if (requestedTask && thoughtIds.current.has(requestedTask)) {
      // A shared or restored task URL should open its canvas after data arrives.
      setSelectedThoughtId(requestedTask);
      setSelectedBookNoteId("");
    } else if (requestedBookNote && bookNoteIds.current.has(requestedBookNote)) {
      const requestedNote = notes.find((note) => note.id === requestedBookNote);
      setSelectedThoughtId("");
      setSelectedBookNoteId(requestedBookNote);
      if (requestedNote) setSelectedBookId(requestedNote.bookId);
      setTab("books");
    } else if (requestedTask || requestedBookNote) {
      history.replaceState(historyStateWithoutDetail(), "", bookNoteUrl());
      setSelectedThoughtId("");
      setSelectedBookNoteId("");
    }
  }, [loaded, notes, thoughts]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    // Browser scroll restoration fires while the outgoing detail is still
    // painted, so the page visibly jumps under the old view. The app restores
    // the offset itself once the workspace is back in the DOM.
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";

    const followHistory = () => {
      setNavigationSource("history");
      const requestedTask = taskIdFromUrl();
      const requestedBookNote = bookNoteIdFromUrl();
      const nextTask = requestedTask && thoughtIds.current.has(requestedTask) ? requestedTask : "";
      const nextBookNote =
        requestedBookNote && bookNoteIds.current.has(requestedBookNote) ? requestedBookNote : "";
      if ((nextTask || nextBookNote) && !detailOpen.current) workspaceScroll.current = window.scrollY;
      setSelectedThoughtId(nextTask);
      setSelectedBookNoteId(nextBookNote);
      if (nextTask || nextBookNote) window.scrollTo({ top: 0, behavior: "auto" });
    };

    window.addEventListener("popstate", followHistory);
    return () => {
      window.removeEventListener("popstate", followHistory);
      history.scrollRestoration = previousRestoration;
    };
  }, []);

  // Safari runs its own snapshot slide for an edge-swipe back. Animating on top
  // of that made the page slide twice, so a browser-driven move settles the
  // views instantly and lets the gesture carry the motion by itself.
  const navigationTransition = navigationSource === "history" ? INSTANT : snappy;

  const openCount = useMemo(() => thoughts.filter((thought) => !thought.done).length, [thoughts]);
  const selectedThought = selectedThoughtId
    ? thoughts.find((thought) => thought.id === selectedThoughtId) ?? null
    : null;
  const selectedBookNote = selectedBookNoteId
    ? notes.find((note) => note.id === selectedBookNoteId) ?? null
    : null;
  const selectedNoteBook = selectedBookNote
    ? books.find((book) => book.id === selectedBookNote.bookId) ?? null
    : null;
  const showingDetail = Boolean(selectedThought || (selectedBookNote && selectedNoteBook));

  // Restore the workspace offset in the same frame the workspace is unhidden.
  // A passive effect lands after paint, so the list flashed at the top for a
  // frame before snapping back to where it was left.
  useBrowserLayoutEffect(() => {
    detailOpen.current = showingDetail;
    if (showingDetail) return;
    window.scrollTo({ top: workspaceScroll.current, behavior: "auto" });
  }, [showingDetail]);

  function openThought(id: string) {
    setNavigationSource("app");
    if (id === selectedThoughtId) return;
    if (!showingDetail) workspaceScroll.current = window.scrollY;
    history.pushState(
      { ...historyStateWithoutDetail(), [TASK_HISTORY_KEY]: id },
      "",
      taskUrl(id),
    );
    setSelectedBookNoteId("");
    setSelectedThoughtId(id);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function closeThought() {
    setNavigationSource("app");
    const shouldReturnThroughHistory = history.state?.[TASK_HISTORY_KEY] === selectedThoughtId;
    // Reveal the still-mounted workspace immediately. Waiting for the
    // asynchronous popstate event makes the back action feel like a refresh.
    setSelectedThoughtId("");
    if (shouldReturnThroughHistory) {
      history.back();
      return;
    }
    history.replaceState(historyStateWithoutDetail(), "", taskUrl());
  }

  function openBookNote(note: BookNote) {
    setNavigationSource("app");
    if (note.id === selectedBookNoteId) return;
    if (!showingDetail) workspaceScroll.current = window.scrollY;
    history.pushState(
      { ...historyStateWithoutDetail(), [BOOK_NOTE_HISTORY_KEY]: note.id },
      "",
      bookNoteUrl(note.id),
    );
    setSelectedThoughtId("");
    setSelectedBookId(note.bookId);
    setSelectedBookNoteId(note.id);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function closeBookNote() {
    setNavigationSource("app");
    const shouldReturnThroughHistory =
      history.state?.[BOOK_NOTE_HISTORY_KEY] === selectedBookNoteId;
    // Reveal the still-mounted book workspace immediately. Waiting for the
    // asynchronous popstate event makes the back action feel like a refresh.
    setSelectedBookNoteId("");
    if (shouldReturnThroughHistory) {
      history.back();
      return;
    }
    history.replaceState(historyStateWithoutDetail(), "", bookNoteUrl());
  }

  function selectDay(day: string) {
    setSelectedDay(day);
    setMonth(monthKey(day));
  }

  function selectTab(next: Tab) {
    if (next === tab) return;
    const from = TABS.findIndex((entry) => entry.value === tab);
    const to = TABS.findIndex((entry) => entry.value === next);
    setTabDirection(to > from ? 1 : -1);
    setTab(next);
  }

  const ready = Boolean(today) && loaded && !loading;

  return (
    <MotionConfig reducedMotion="user">
      <main
        className={`app ${online ? "" : "is-offline"} ${showingDetail ? "showing-task" : ""}`}
        data-app="second-brain"
        data-online={online}
      >
        <motion.header
          className={`masthead ${tab === "calendar" ? "masthead-home" : "masthead-section"} ${
            scrolled ? "is-scrolled" : ""
          }`}
          hidden={showingDetail}
          aria-hidden={showingDetail || undefined}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={snappy}
        >
          {tab === "calendar" && (
            <span className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="brand-mark" src="/animated.svg" alt="" width={32} height={32} />
              <motion.span className="wordmark" style={{ scale: wordmarkScale }}>
                Second Brain
              </motion.span>
            </span>
          )}
          <div className="masthead-meta">
            <span className="masthead-date">
              {today ? formatDate(today, { weekday: "long", month: "long", day: "numeric" }) : " "}
            </span>
            <nav className="nav-top" aria-label="Sections">
              {TABS.map(({ value, label, glyph: Glyph }) => (
                <button
                  key={value}
                  className={`seg-btn ${tab === value ? "active" : ""}`}
                  onClick={() => selectTab(value)}
                  aria-current={tab === value ? "page" : undefined}
                >
                  {tab === value && <motion.span className="seg-pill" layoutId="seg-pill" transition={snappy} />}
                  <span className="seg-label">
                    <span className="seg-glyph" aria-hidden="true">
                      <Glyph size={14} />
                    </span>
                    <span>{label}</span>
                    {value === "thoughts" && openCount > 0 && <span className="seg-badge">{openCount}</span>}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </motion.header>

        <AnimatePresence initial={false}>
          {loaded && !online && (
            <motion.div key="offline" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={gentle}>
              <StatusBanner tone="offline" icon={<OfflineIcon />} title="You’re offline">
                You can look around. Changes need a connection.
              </StatusBanner>
            </motion.div>
          )}
          {loaded && online && error && (
            <motion.div key="error" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={gentle}>
              <StatusBanner
                tone="error"
                icon={<AlertIcon />}
                title="That didn’t work"
                action={{ label: "Try again", onClick: retryLoad }}
              >
                {error.message}
              </StatusBanner>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`page ${showingDetail ? "page-task" : `page-${tab}`}`}>
          {/* Keep the workspace mounted while a canvas is open so closing a
              reading note reveals the same book page instead of rebuilding it. */}
          <motion.div
            key="workspace"
            hidden={showingDetail}
            aria-hidden={showingDetail || undefined}
            initial={{ opacity: 0, y: 8 }}
            // Settle back under the canvas while it is open, so closing one
            // slides the workspace home instead of cutting to it.
            animate={showingDetail ? { opacity: 0.6, x: "-20%", y: 0 } : { opacity: 1, x: 0, y: 0 }}
            transition={navigationTransition}
          >
            {!today || loading ? (
              <LoadingState />
            ) : !ready ? (
              <QuietState
                className="open-failure card"
                icon={online ? <AlertIcon size={20} /> : <OfflineIcon size={20} />}
                title={online ? "Second Brain didn’t open" : "Your connection is quiet"}
                action={{ label: "Try again", onClick: retryLoad }}
              >
                {online
                  ? error?.message || "Try opening it again."
                  : "Reconnect, then try opening your thoughts and notes again."}
              </QuietState>
            ) : (
              <>
                {tab === "calendar" && (
                  <Briefing
                    thoughts={thoughts}
                    books={books}
                    notes={notes}
                    today={today}
                    onOpenDetail={openThought}
                  />
                )}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, x: 28 * tabDirection }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -28 * tabDirection }}
                    transition={gentle}
                  >
                    {tab === "calendar" ? (
                      <CalendarTab
                        thoughts={thoughts}
                        notes={notes}
                        books={books}
                        today={today}
                        month={activeMonth}
                        selectedDay={activeDay}
                        onMonthChange={(direction) =>
                          setMonth(shiftMonth(activeMonth, direction === "next" ? 1 : -1))
                        }
                        onSelectDay={selectDay}
                        onUpdate={updateThought}
                        onDelete={deleteThought}
                        onOpenDetail={openThought}
                        deletingIds={deletingIds}
                        readOnly={!online}
                      />
                    ) : tab === "thoughts" ? (
                      <MatrixTab
                        thoughts={thoughts}
                        today={today}
                        busy={busy || !online}
                        canvasOpen={showingDetail}
                        readOnly={!online}
                        onCapture={captureThought}
                        onUpdate={updateThought}
                        onDelete={deleteThought}
                        onOpenDetail={openThought}
                        deletingIds={deletingIds}
                      />
                    ) : tab === "books" ? (
                      <BooksTab
                        books={books}
                        notes={notes}
                        today={today}
                        busy={busy || !online}
                        readOnly={!online}
                        selectedBookId={selectedBookId}
                        onSelectBook={setSelectedBookId}
                        onAddBook={addBook}
                        onUpdateBook={updateBook}
                        onDeleteBook={deleteBook}
                        onAddNote={addNote}
                        onOpenNote={openBookNote}
                        onDeleteNote={deleteNote}
                        deletingIds={deletingIds}
                      />
                    ) : (
                      <ReviewTab
                        thoughts={thoughts}
                        books={books}
                        notes={notes}
                        today={today}
                        onOpenDetail={openThought}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </>
            )}
          </motion.div>

          <AnimatePresence initial={false}>
            {selectedThought ? (
              <TaskDetail
                key={`task-${selectedThought.id}`}
                thought={selectedThought}
                transition={navigationTransition}
                readOnly={!online}
                onBack={closeThought}
                onUpdate={updateThought}
              />
            ) : selectedBookNote && selectedNoteBook ? (
              <BookNoteDetail
                key={`book-note-${selectedBookNote.id}`}
                book={selectedNoteBook}
                note={selectedBookNote}
                transition={navigationTransition}
                readOnly={!online}
                onBack={closeBookNote}
                onUpdate={updateNote}
              />
            ) : null}
          </AnimatePresence>
        </div>

        {/* Keep navigation mounted across a canvas visit. Remounting it on
            close replayed its entrance motion and looked like a page flash. */}
        <motion.nav
          className="tabbar"
          aria-label="Sections"
          hidden={showingDetail}
          aria-hidden={showingDetail || undefined}
          initial={{ opacity: 0, x: "-50%", y: 14 }}
          animate={{ opacity: 1, x: "-50%", y: 0 }}
          transition={snappy}
        >
          {TABS.map(({ value, label, glyph: Glyph }) => (
            <button
              key={value}
              className={`tab-btn ${tab === value ? "active" : ""}`}
              onClick={() => selectTab(value)}
              aria-current={tab === value ? "page" : undefined}
            >
              {tab === value && <motion.span className="tab-pill" layoutId="tab-pill" transition={snappy} />}
              <span className="tab-glyph" aria-hidden="true">
                <Glyph size={20} />
              </span>
              <span className="tab-text">{label}</span>
              {value === "thoughts" && openCount > 0 && <span className="tab-badge">{openCount}</span>}
            </button>
          ))}
        </motion.nav>
      </main>
    </MotionConfig>
  );
}
