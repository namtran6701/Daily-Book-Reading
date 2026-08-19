"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "./date-keys";
import {
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  PencilIcon,
  PlusIcon,
  SubmitIcon,
  TrashIcon,
  UndoIcon,
} from "./icons";
import type { Book, BookNote } from "./types";

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
  onAddNote: (bookId: string, text: string, page: string) => Promise<boolean>;
  onUpdateNote: (id: string, patch: Partial<BookNote>) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
};

function NoteRow({
  note,
  today,
  onUpdate,
  onDelete,
}: {
  note: BookNote;
  today: string;
  onUpdate: (id: string, patch: Partial<BookNote>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const editor = useRef<HTMLTextAreaElement>(null);

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
    <li className="book-note">
      {note.page && <span className="note-page">p.{note.page}</span>}
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
            <button className="icon-action" onClick={() => void save()} aria-label="Save" title="Save">
              <CheckIcon />
            </button>
            <button
              className="icon-action quiet"
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
            <span>
              {note.dayKey === today ? "today" : formatDate(note.dayKey, { month: "short", day: "numeric" })}
            </span>
            <button
              className="icon-action"
              onClick={() => {
                setDraft(note.body);
                setEditing(true);
              }}
              aria-label="Edit note"
              title="Edit note"
            >
              <PencilIcon />
            </button>
            <button
              className="icon-action danger"
              onClick={() => void onDelete(note.id)}
              aria-label="Delete note"
              title="Delete note"
            >
              <TrashIcon />
            </button>
          </div>
        </>
      )}
    </li>
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
}: Props) {
  const [title, setTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [page, setPage] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of notes) map.set(note.bookId, (map.get(note.bookId) ?? 0) + 1);
    return map;
  }, [notes]);

  const book = books.find((entry) => entry.id === selectedBookId) ?? null;

  const bookNotes = useMemo(
    () =>
      notes
        .filter((note) => note.bookId === selectedBookId)
        .sort((a, b) => b.dayKey.localeCompare(a.dayKey) || b.createdAt.localeCompare(a.createdAt)),
    [notes, selectedBookId],
  );

  async function addBook() {
    if (!title.trim()) return;
    if (await onAddBook(title)) setTitle("");
  }

  async function addNote() {
    if (!book || !noteText.trim()) return;
    if (await onAddNote(book.id, noteText, page)) setNoteText("");
  }

  if (book) {
    return (
      <section className="book-detail" aria-label={book.title}>
        <button
          className="icon-action back"
          onClick={() => onSelectBook("")}
          aria-label="All books"
          title="All books"
        >
          <ChevronLeftIcon />
        </button>

        <header className="book-header">
          <h2>{book.title}</h2>
          <div className="book-meta">
            <span>
              {bookNotes.length} {bookNotes.length === 1 ? "note" : "notes"}
            </span>
            <button
              className="icon-action"
              onClick={() => void onUpdateBook(book.id, { finished: !book.finishedAt })}
              aria-label={book.finishedAt ? "Move back to reading" : "Mark finished"}
              title={book.finishedAt ? "Move back to reading" : "Mark finished"}
            >
              {book.finishedAt ? <UndoIcon /> : <CheckIcon />}
            </button>
            <button
              className="icon-action danger"
              onClick={() => void onDeleteBook(book.id)}
              aria-label="Delete book"
              title="Delete book"
            >
              <TrashIcon />
            </button>
          </div>
        </header>

        <div className="note-capture">
          <input
            className="page-input"
            value={page}
            onChange={(event) => setPage(event.target.value)}
            placeholder="p."
            aria-label="Page number, optional"
          />
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
          <button
            className="keep-button"
            onClick={() => void addNote()}
            disabled={busy || !noteText.trim()}
            aria-label={busy ? "Saving note" : "Add note"}
            title="Add note"
          >
            <SubmitIcon />
          </button>
        </div>

        {bookNotes.length === 0 ? (
          <p className="empty-line">No notes from this book yet.</p>
        ) : (
          <ul className="note-list">
            {bookNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                today={today}
                onUpdate={onUpdateNote}
                onDelete={onDeleteNote}
              />
            ))}
          </ul>
        )}
      </section>
    );
  }

  const reading = books.filter((entry) => !entry.finishedAt);
  const finished = books.filter((entry) => entry.finishedAt);

  return (
    <>
      <section className="book-add" aria-label="Add a book">
        <h2>What are you reading?</h2>
        <div className="book-add-fields">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void addBook()}
            placeholder="Title"
            aria-label="Book title"
          />
          <button
            className="keep-button"
            onClick={() => void addBook()}
            disabled={busy || !title.trim()}
            aria-label="Add book"
            title="Add book"
          >
            <PlusIcon />
          </button>
        </div>
      </section>

      {[
        { label: "Reading", rows: reading },
        { label: "Finished", rows: finished },
      ].map(({ label, rows }) =>
        rows.length === 0 ? null : (
          <section key={label} className="book-group" aria-label={label}>
            <h3>{label}</h3>
            <ul className="book-list">
              {rows.map((entry) => (
                <li key={entry.id}>
                  <button onClick={() => onSelectBook(entry.id)}>
                    <span className="book-copy">
                      <strong>{entry.title}</strong>
                    </span>
                    <span className="book-count">{counts.get(entry.id) ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}

      {books.length === 0 && (
        <p className="empty-line">Add the first book and your notes will collect under it.</p>
      )}
    </>
  );
}
