"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ageLabel, dayTitle, formatDate } from "@/lib/date-keys";
import {
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SpinnerIcon,
  SubmitIcon,
  TrashIcon,
  UndoIcon,
} from "./icons";
import { bouncy, gentle, snappy } from "@/lib/springs";
import type { Book, BookNote } from "@/lib/types";

type Props = {
  books: Book[];
  notes: BookNote[];
  today: string;
  busy: boolean;
  selectedBookId: string;
  onSelectBook: (id: string) => void;
  onAddBook: (title: string) => Promise<boolean>;
  onUpdateBook: (id: string, patch: { finished?: boolean }) => Promise<void>;
  onDeleteBook: (id: string) => Promise<void>;
  onAddNote: (bookId: string, text: string, page: string, pageEnd: string) => Promise<boolean>;
  onUpdateNote: (id: string, patch: Partial<BookNote>) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  // Ids (books and notes) whose DELETE is in flight; their rows lock and spin.
  deletingIds: Set<string>;
};

// A stable hash so every title always renders the same generated cover.
function hashTitle(title: string): number {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export function BookCover({ title, large }: { title: string; large?: boolean }) {
  const hash = hashTitle(title.trim().toLowerCase());
  return (
    <span
      className={`book-cover c${hash % 6} p${(hash >> 4) % 3} ${large ? "cover-large" : ""}`}
      aria-hidden="true"
    >
      <i className="cover-art" />
      <i className="cover-spine" />
      <b className="cover-title">{title}</b>
      <em className="cover-mark">✦</em>
    </span>
  );
}

// Turns the stored start/end pages into a badge label and, when both are
// numeric with end >= start, an inclusive count of pages read.
function pageInfo(page: string, pageEnd: string): { label: string; read: number | null } | null {
  const start = page.trim();
  const end = pageEnd.trim();
  if (!start && !end) return null;
  const startNum = Number(start);
  const endNum = Number(end);
  const read =
    start && end && Number.isFinite(startNum) && Number.isFinite(endNum) && endNum >= startNum
      ? endNum - startNum + 1
      : null;
  const label = start && end ? `p.${start}–${end}` : `p.${start || end}`;
  return { label, read };
}

function NoteRow({
  note,
  onUpdate,
  onDelete,
  deleting,
}: {
  note: BookNote;
  onUpdate: (id: string, patch: Partial<BookNote>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  deleting?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const editor = useRef<HTMLTextAreaElement>(null);
  const page = pageInfo(note.page, note.pageEnd);

  useEffect(() => {
    if (editing) editor.current?.focus();
  }, [editing]);

  async function save() {
    const body = draft.trim();
    setEditing(false);
    if (!body || body === note.body) {
      setDraft(note.body);
      return;
    }
    await onUpdate(note.id, { body });
  }

  return (
    <motion.li
      className={`book-note ${deleting ? "is-deleting" : ""}`}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={snappy}
    >
      {page && (
        <span className="note-page">
          {page.label}
          {page.read !== null && (
            <em className="note-pages-read">
              {page.read} {page.read === 1 ? "page" : "pages"}
            </em>
          )}
        </span>
      )}
      {editing ? (
        <div className="thought-editor">
          <textarea
            ref={editor}
            value={draft}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(note.body);
                setEditing(false);
              }
            }}
            aria-label="Edit this note"
          />
          <div className="editor-actions">
            <button className="icon-action pressable" onClick={() => void save()} aria-label="Save" title="Save">
              <CheckIcon />
            </button>
            <button
              className="icon-action quiet pressable"
              onClick={() => {
                setDraft(note.body);
                setEditing(false);
              }}
              aria-label="Cancel"
              title="Cancel"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      ) : (
        <>
          <p>{note.body}</p>
          <div className="note-meta">
            <button
              className="icon-action pressable"
              onClick={() => {
                setDraft(note.body);
                setEditing(true);
              }}
              disabled={deleting}
              aria-label="Edit note"
              title="Edit note"
            >
              <PencilIcon />
            </button>
            <button
              className="icon-action danger pressable"
              onClick={() => void onDelete(note.id)}
              disabled={deleting}
              aria-label={deleting ? "Deleting note" : "Delete note"}
              title={deleting ? "Deleting note" : "Delete note"}
            >
              {deleting ? <SpinnerIcon /> : <TrashIcon />}
            </button>
          </div>
        </>
      )}
    </motion.li>
  );
}

function BookCard({
  book,
  notes,
  today,
  onOpen,
}: {
  book: Book;
  notes: BookNote[];
  today: string;
  onOpen: () => void;
}) {
  const latest = notes[0] ?? null;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={gentle}
    >
      <button className="book-card" onClick={onOpen}>
        <BookCover title={book.title} />
        {book.finishedAt && (
          <span className="finished-badge" title="Finished">
            <CheckIcon size={11} />
          </span>
        )}
        <span className="book-card-meta">
          <strong>{book.title}</strong>
          <span className="book-card-stats">
            {notes.length === 0
              ? "No notes yet"
              : `${notes.length} ${notes.length === 1 ? "note" : "notes"} · ${ageLabel(latest!.dayKey, today)}`}
          </span>
          {latest && <span className="book-card-preview">&ldquo;{latest.body}&rdquo;</span>}
        </span>
      </button>
    </motion.li>
  );
}

export function BooksTab({
  books,
  notes,
  today,
  busy,
  selectedBookId,
  onSelectBook,
  onAddBook,
  onUpdateBook,
  onDeleteBook,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  deletingIds,
}: Props) {
  const [title, setTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [page, setPage] = useState("");
  const [pageEnd, setPageEnd] = useState("");
  const [query, setQuery] = useState("");

  const notesByBook = useMemo(() => {
    const map = new Map<string, BookNote[]>();
    for (const note of notes) map.set(note.bookId, [...(map.get(note.bookId) ?? []), note]);
    for (const rows of map.values())
      rows.sort((a, b) => b.dayKey.localeCompare(a.dayKey) || b.createdAt.localeCompare(a.createdAt));
    return map;
  }, [notes]);

  const book = books.find((entry) => entry.id === selectedBookId) ?? null;
  const bookNotes = useMemo(
    () => (book ? notesByBook.get(book.id) ?? [] : []),
    [notesByBook, book],
  );

  const journal = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = needle
      ? bookNotes.filter((note) => note.body.toLowerCase().includes(needle))
      : bookNotes;
    const days = new Map<string, BookNote[]>();
    for (const note of visible) days.set(note.dayKey, [...(days.get(note.dayKey) ?? []), note]);
    return Array.from(days, ([dayKey, rows]) => ({ dayKey, rows }));
  }, [bookNotes, query]);

  async function addBook() {
    if (busy || !title.trim()) return;
    if (await onAddBook(title)) setTitle("");
  }

  // Both pages given and numeric: the start must come before the end.
  const startNum = Number(page.trim());
  const endNum = Number(pageEnd.trim());
  const rangeError =
    page.trim() !== "" &&
    pageEnd.trim() !== "" &&
    Number.isFinite(startNum) &&
    Number.isFinite(endNum) &&
    startNum >= endNum;

  async function addNote() {
    if (busy || !book || !noteText.trim() || rangeError) return;
    if (await onAddNote(book.id, noteText, page, pageEnd)) setNoteText("");
  }

  const reading = books.filter((entry) => !entry.finishedAt);
  const finished = books.filter((entry) => entry.finishedAt);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {book ? (
        <motion.section
          key={`detail-${book.id}`}
          className="book-detail"
          aria-label={book.title}
          initial={{ opacity: 0, x: 44 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 44 }}
          transition={snappy}
        >
          <button
            className="back pressable"
            onClick={() => {
              setQuery("");
              onSelectBook("");
            }}
            aria-label="All books"
          >
            <ChevronLeftIcon />
            Books
          </button>

          <header className="book-header card">
            <BookCover title={book.title} large />
            <div className="book-header-copy">
              <h2>{book.title}</h2>
              <p className="book-header-stats">
                {bookNotes.length} {bookNotes.length === 1 ? "note" : "notes"}
                {" · started "}
                {formatDate(book.createdAt.slice(0, 10), { month: "short", day: "numeric" })}
                {book.finishedAt && <span className="finished-tag">Finished</span>}
              </p>
              <div className="book-meta">
                <button
                  className="text-button pressable"
                  onClick={() => void onUpdateBook(book.id, { finished: !book.finishedAt })}
                >
                  {book.finishedAt ? <UndoIcon /> : <CheckIcon />}
                  {book.finishedAt ? "Back to reading" : "Mark finished"}
                </button>
                <button
                  className="icon-action danger pressable"
                  onClick={() => void onDeleteBook(book.id)}
                  disabled={deletingIds.has(book.id)}
                  aria-label={deletingIds.has(book.id) ? "Deleting book" : "Delete book"}
                  title={deletingIds.has(book.id) ? "Deleting book" : "Delete book"}
                >
                  {deletingIds.has(book.id) ? <SpinnerIcon /> : <TrashIcon />}
                </button>
              </div>
            </div>
          </header>

          <div className="note-capture card">
            <div className="page-range">
              <input
                className={`page-input${rangeError ? " invalid" : ""}`}
                value={page}
                onChange={(event) => setPage(event.target.value)}
                placeholder="p."
                inputMode="numeric"
                aria-label="Start page, optional"
                aria-invalid={rangeError}
              />
              <span className="page-range-sep" aria-hidden="true">
                –
              </span>
              <input
                className={`page-input${rangeError ? " invalid" : ""}`}
                value={pageEnd}
                onChange={(event) => setPageEnd(event.target.value)}
                placeholder="p."
                inputMode="numeric"
                aria-label="End page, optional"
                aria-invalid={rangeError}
              />
            </div>
            <textarea
              value={noteText}
              rows={2}
              placeholder="What stood out? One note per line."
              onChange={(event) => setNoteText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void addNote();
                }
              }}
              aria-label="Your note"
            />
            <motion.button
              className="keep-button"
              onClick={() => void addNote()}
              disabled={busy || !noteText.trim() || rangeError}
              whileTap={{ scale: 0.88 }}
              transition={bouncy}
              aria-label={busy ? "Saving note" : "Add note"}
              title="Add note"
            >
              <SubmitIcon />
            </motion.button>
          </div>
          {rangeError && (
            <p className="capture-error" role="alert">
              Start page must be smaller than the end page.
            </p>
          )}

          {bookNotes.length > 4 && (
            <label className="note-search">
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your notes"
                aria-label="Search notes in this book"
              />
              {query && (
                <button className="icon-action quiet pressable" onClick={() => setQuery("")} aria-label="Clear search">
                  <CloseIcon size={13} />
                </button>
              )}
            </label>
          )}

          {bookNotes.length === 0 ? (
            <p className="empty-line">No notes from this book yet. The first one is the hardest.</p>
          ) : journal.length === 0 ? (
            <p className="empty-line">Nothing matches &ldquo;{query}&rdquo;.</p>
          ) : (
            <div className="journal">
              {journal.map(({ dayKey, rows }) => (
                <section key={dayKey} className="journal-day" aria-label={dayTitle(dayKey, today)}>
                  <h3>{dayTitle(dayKey, today)}</h3>
                  <ul className="note-list">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {rows.map((note) => (
                        <NoteRow
                          key={note.id}
                          note={note}
                          onUpdate={onUpdateNote}
                          onDelete={onDeleteNote}
                          deleting={deletingIds.has(note.id)}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                </section>
              ))}
            </div>
          )}
        </motion.section>
      ) : (
        <motion.div
          key="list"
          initial={{ opacity: 0, x: -44 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -44 }}
          transition={snappy}
        >
          <section className="book-add card" aria-label="Add a book">
            <h2>What are you reading?</h2>
            <div className="book-add-fields">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void addBook()}
                placeholder="Title"
                aria-label="Book title"
              />
              <motion.button
                className="keep-button"
                onClick={() => void addBook()}
                disabled={busy || !title.trim()}
                whileTap={{ scale: 0.88 }}
                transition={bouncy}
                aria-label="Add book"
                title="Add book"
              >
                <PlusIcon />
              </motion.button>
            </div>
          </section>

          {[
            { label: "Reading now", rows: reading },
            { label: "Finished", rows: finished },
          ].map(({ label, rows }) =>
            rows.length === 0 ? null : (
              <section key={label} className="shelf-section" aria-label={label}>
                <h3 className="shelf-label">
                  {label} <em>{rows.length}</em>
                </h3>
                <ul className="shelf">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {rows.map((entry) => (
                      <BookCard
                        key={entry.id}
                        book={entry}
                        notes={notesByBook.get(entry.id) ?? []}
                        today={today}
                        onOpen={() => onSelectBook(entry.id)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ),
          )}

          {books.length === 0 && (
            <p className="empty-line">Add the first book and your notes will collect under it.</p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
