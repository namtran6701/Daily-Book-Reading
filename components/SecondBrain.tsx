"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";
import { BooksTab } from "./BooksTab";
import { Briefing } from "./Briefing";
import { CalendarTab } from "./CalendarTab";
import { MatrixTab } from "./MatrixTab";
import { ReviewTab } from "./ReviewTab";
import { LoadingState, QuietState, StatusBanner } from "./UiState";
import { formatDate, localDateKey, monthKey, shiftMonth } from "@/lib/date-keys";
import { AlertIcon, BookGlyph, MatrixGlyph, OfflineIcon, ReviewGlyph, TodayIcon } from "./icons";
import type { Quadrant } from "@/lib/quadrants";
import { gentle, snappy } from "@/lib/springs";
import type { Book, BookNote, Thought } from "@/lib/types";

type Tab = "calendar" | "thoughts" | "books" | "review";

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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("calendar");
  const [tabDirection, setTabDirection] = useState(1);
  const [month, setMonth] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedBookId, setSelectedBookId] = useState("");
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
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open your second brain.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A one-shot fetch on mount: there is no external system to subscribe to.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const retryLoad = useCallback(() => {
    setError("");
    setLoading(true);
    void load();
  }, [load]);

  // Delete the row only once the server confirms. The id spins in the meantime,
  // and a failed request leaves the row in place with an error rather than
  // removing it and hoping the request lands. `apply` prunes local state on
  // success; a 404 counts as success since the row is already gone server-side.
  const runDelete = useCallback(
    async (id: string, url: string, apply: () => void, message: string) => {
      setDeletingIds((current) => new Set(current).add(id));
      try {
        const response = await apiFetch(url, { method: "DELETE" });
        // A 404 means it is already gone server-side, which is the outcome we want.
        if (!response.ok && response.status !== 404) throw new Error(message);
        apply();
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : message);
      } finally {
        setDeletingIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [],
  );

  const captureThought = useCallback(
    async (text: string, quadrant: Quadrant) => {
      setBusy(true);
      try {
        const response = await apiFetch("/api/thoughts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, quadrant, dayKey: today }),
        });
        const payload = await readJson<{ thoughts: Thought[] }>(response, "Could not keep that.");
        setThoughts((current) => [...payload.thoughts, ...current]);
        setError("");
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not keep that.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [today],
  );

  const updateThought = useCallback(async (id: string, patch: Partial<Thought>) => {
    setThoughts((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    try {
      const response = await apiFetch("/api/thoughts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = await readJson<{ thought: Thought }>(response, "Could not update that thought.");
      setThoughts((current) => current.map((item) => (item.id === id ? payload.thought : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update that thought.");
      void load();
    }
  }, [load]);

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
      setError("");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that book.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const updateBook = useCallback(async (id: string, patch: { finished?: boolean }) => {
    try {
      const response = await apiFetch("/api/books", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = await readJson<{ book: Book }>(response, "Could not update that book.");
      setBooks((current) => current.map((item) => (item.id === id ? payload.book : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update that book.");
    }
  }, []);

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
    async (bookId: string, text: string, page: string, pageEnd: string) => {
      setBusy(true);
      try {
        const response = await apiFetch("/api/book-notes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bookId, text, page, pageEnd, dayKey: today }),
        });
        const payload = await readJson<{ notes: BookNote[] }>(response, "Could not save that note.");
        setNotes((current) => [...payload.notes, ...current]);
        setError("");
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not save that note.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [today],
  );

  const updateNote = useCallback(async (id: string, patch: Partial<BookNote>) => {
    setNotes((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    try {
      const response = await apiFetch("/api/book-notes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = await readJson<{ note: BookNote }>(response, "Could not update that note.");
      setNotes((current) => current.map((item) => (item.id === id ? payload.note : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update that note.");
      void load();
    }
  }, [load]);

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

  const openCount = useMemo(() => thoughts.filter((thought) => !thought.done).length, [thoughts]);

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
      <main className={`app ${online ? "" : "is-offline"}`} data-app="second-brain" data-online={online}>
        <header className={`masthead ${scrolled ? "is-scrolled" : ""}`}>
          <span className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-mark" src="/animated.svg" alt="" width={32} height={32} />
            <motion.span className="wordmark" style={{ scale: wordmarkScale }}>
              Second Brain
            </motion.span>
          </span>
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
        </header>

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
                {error}
              </StatusBanner>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`page page-${tab}`}>
          {!today || loading ? (
            <LoadingState />
          ) : !ready ? (
            <QuietState
              className="open-failure card"
              icon={online ? <AlertIcon size={20} /> : <OfflineIcon size={20} />}
              title={online ? "Second Brain didn’t open" : "Your connection is quiet"}
              action={{ label: "Try again", onClick: retryLoad }}
            >
              {online ? error || "Try opening it again." : "Reconnect, then try opening your thoughts and notes again."}
            </QuietState>
          ) : (
            <>
              {tab === "calendar" && <Briefing thoughts={thoughts} books={books} notes={notes} today={today} />}
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
                      deletingIds={deletingIds}
                      readOnly={!online}
                    />
                  ) : tab === "thoughts" ? (
                    <MatrixTab
                      thoughts={thoughts}
                      today={today}
                      busy={busy || !online}
                      readOnly={!online}
                      onCapture={captureThought}
                      onUpdate={updateThought}
                      onDelete={deleteThought}
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
                      onUpdateNote={updateNote}
                      onDeleteNote={deleteNote}
                      deletingIds={deletingIds}
                    />
                  ) : (
                    <ReviewTab thoughts={thoughts} books={books} notes={notes} today={today} />
                  )}
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </div>

        <nav className="tabbar" aria-label="Sections">
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
        </nav>
      </main>
    </MotionConfig>
  );
}
