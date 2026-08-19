"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BooksTab } from "./BooksTab";
import { CalendarTab } from "./CalendarTab";
import { MatrixTab } from "./MatrixTab";
import { formatDate, localDateKey, monthKey, shiftMonth } from "./date-keys";
import type { Quadrant } from "./quadrants";
import type { Book, BookNote, Thought } from "./types";

type Tab = "calendar" | "thoughts" | "books";

const TABS: { value: Tab; label: string }[] = [
  { value: "calendar", label: "Calendar" },
  { value: "thoughts", label: "Thoughts" },
  { value: "books", label: "Books" },
];

function subscribeToNothing(): () => void {
  return () => {};
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? fallback);
  return payload;
}

export function SecondBrain() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("calendar");
  const [month, setMonth] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedBookId, setSelectedBookId] = useState("");

  // The server runs in UTC and the browser does not, so the current date is
  // read on the client only. It stays empty through the server render.
  const today = useSyncExternalStore(subscribeToNothing, localDateKey, () => "");
  const activeDay = selectedDay || today;
  const activeMonth = month || (today ? monthKey(today) : "");

  const load = useCallback(async () => {
    try {
      const [thoughtsResponse, booksResponse, notesResponse] = await Promise.all([
        fetch("/api/thoughts", { cache: "no-store" }),
        fetch("/api/books", { cache: "no-store" }),
        fetch("/api/book-notes", { cache: "no-store" }),
      ]);
      setThoughts((await readJson<{ thoughts: Thought[] }>(thoughtsResponse, "Could not load your thoughts.")).thoughts);
      setBooks((await readJson<{ books: Book[] }>(booksResponse, "Could not load your books.")).books);
      setNotes((await readJson<{ notes: BookNote[] }>(notesResponse, "Could not load your notes.")).notes);
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

  const captureThought = useCallback(
    async (text: string, quadrant: Quadrant) => {
      setBusy(true);
      try {
        const response = await fetch("/api/thoughts", {
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
      const response = await fetch("/api/thoughts", {
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

  const deleteThought = useCallback(async (id: string) => {
    if (!window.confirm("Delete this thought for good?")) return;
    setThoughts((current) => current.filter((item) => item.id !== id));
    const response = await fetch(`/api/thoughts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Could not delete that thought.");
      void load();
    }
  }, [load]);

  const addBook = useCallback(async (title: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/books", {
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
      const response = await fetch("/api/books", {
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

  const deleteBook = useCallback(async (id: string) => {
    if (!window.confirm("Delete this book and every note under it?")) return;
    const response = await fetch(`/api/books?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Could not delete that book.");
      return;
    }
    setSelectedBookId("");
    setBooks((current) => current.filter((item) => item.id !== id));
    setNotes((current) => current.filter((item) => item.bookId !== id));
  }, []);

  const addNote = useCallback(
    async (bookId: string, text: string, page: string) => {
      setBusy(true);
      try {
        const response = await fetch("/api/book-notes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bookId, text, page, dayKey: today }),
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
      const response = await fetch("/api/book-notes", {
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

  const deleteNote = useCallback(async (id: string) => {
    if (!window.confirm("Delete this note for good?")) return;
    setNotes((current) => current.filter((item) => item.id !== id));
    const response = await fetch(`/api/book-notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Could not delete that note.");
      void load();
    }
  }, [load]);

  const openCount = useMemo(() => thoughts.filter((thought) => !thought.done).length, [thoughts]);

  function selectDay(day: string) {
    setSelectedDay(day);
    setMonth(monthKey(day));
  }

  return (
    <main className="app" data-app="second-brain">
      <header className="masthead">
        <div className="masthead-top">
          <span className="wordmark">Second Brain</span>
          <span className="masthead-date">
            {today ? formatDate(today, { weekday: "long", month: "long", day: "numeric" }) : " "}
          </span>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
              aria-current={tab === value ? "page" : undefined}
            >
              {label}
              {value === "thoughts" && openCount > 0 && <sup>{openCount}</sup>}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button
            onClick={() => {
              setError("");
              setLoading(true);
              void load();
            }}
          >
            Try again
          </button>
        </div>
      )}

      <div className={`page page-${tab}`}>
        {!today || loading ? (
          <p className="empty-line">Opening your second brain…</p>
        ) : tab === "calendar" ? (
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
          />
        ) : tab === "thoughts" ? (
          <MatrixTab
            thoughts={thoughts}
            today={today}
            busy={busy}
            onCapture={captureThought}
            onUpdate={updateThought}
            onDelete={deleteThought}
          />
        ) : (
          <BooksTab
            books={books}
            notes={notes}
            today={today}
            busy={busy}
            selectedBookId={selectedBookId}
            onSelectBook={setSelectedBookId}
            onAddBook={addBook}
            onUpdateBook={updateBook}
            onDeleteBook={deleteBook}
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
          />
        )}
      </div>
    </main>
  );
}
