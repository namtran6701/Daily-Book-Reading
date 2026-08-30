"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { BookGlyph, ChevronLeftIcon, NoteIcon } from "./icons";
import { formatDate } from "@/lib/date-keys";
import { snappy } from "@/lib/springs";
import type { Book, BookNote } from "@/lib/types";

type SaveState = "saved" | "unsaved" | "saving" | "error";

export type BookNoteUpdateOptions = {
  background?: boolean;
  keepalive?: boolean;
};

type Props = {
  book: Book;
  note: BookNote;
  readOnly?: boolean;
  onBack: () => void;
  onUpdate: (
    id: string,
    patch: Partial<BookNote>,
    options?: BookNoteUpdateOptions,
  ) => Promise<boolean>;
};

type ReadingDraft = {
  body: string;
  notes: string;
  page: string;
  pageEnd: string;
};

const SAVE_DELAY = 700;
const DRAFT_PREFIX = "second-brain-reading-note-draft:";

function draftKey(id: string): string {
  return `${DRAFT_PREFIX}${id}`;
}

function readDraft(id: string, fallback: ReadingDraft): ReadingDraft {
  try {
    const value = localStorage.getItem(draftKey(id));
    if (!value) return fallback;
    const parsed = JSON.parse(value) as Partial<ReadingDraft>;
    if (
      typeof parsed.body !== "string" ||
      typeof parsed.notes !== "string" ||
      typeof parsed.page !== "string" ||
      typeof parsed.pageEnd !== "string"
    ) {
      return fallback;
    }
    return {
      body: parsed.body,
      notes: parsed.notes,
      page: parsed.page,
      pageEnd: parsed.pageEnd,
    };
  } catch {
    return fallback;
  }
}

function storeDraft(id: string, draft: ReadingDraft): void {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(draft));
  } catch {
    // Network autosave still works when local storage is unavailable or full.
  }
}

function removeDraft(id: string): void {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    // A stale local draft is harmless and will be reconciled when this note reopens.
  }
}

function isClean(draft: ReadingDraft, saved: ReadingDraft): boolean {
  return (
    draft.body.trim() === saved.body &&
    draft.notes === saved.notes &&
    draft.page.trim() === saved.page &&
    draft.pageEnd.trim() === saved.pageEnd
  );
}

export function BookNoteDetail({ book, note, readOnly, onBack, onUpdate }: Props) {
  const [initialDraft] = useState(() =>
    readDraft(note.id, {
      body: note.body,
      notes: note.notes,
      page: note.page,
      pageEnd: note.pageEnd,
    }),
  );
  const [body, setBody] = useState(initialDraft.body);
  const [notes, setNotes] = useState(initialDraft.notes);
  const [page, setPage] = useState(initialDraft.page);
  const [pageEnd, setPageEnd] = useState(initialDraft.pageEnd);
  const [saveState, setSaveState] = useState<SaveState>(() =>
    isClean(initialDraft, {
      body: note.body,
      notes: note.notes,
      page: note.page,
      pageEnd: note.pageEnd,
    })
      ? "saved"
      : "unsaved",
  );
  const savedDocument = useRef<ReadingDraft>({
    body: note.body,
    notes: note.notes,
    page: note.page,
    pageEnd: note.pageEnd,
  });
  const draftDocument = useRef<ReadingDraft>(initialDraft);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveLoop = useRef<Promise<boolean> | null>(null);
  const updateQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const mounted = useRef(true);
  const readOnlyValue = useRef(Boolean(readOnly));
  const updateValue = useRef(onUpdate);

  useEffect(() => {
    readOnlyValue.current = Boolean(readOnly);
    updateValue.current = onUpdate;
  }, [onUpdate, readOnly]);

  function setStatus(state: SaveState): void {
    if (mounted.current) setSaveState(state);
  }

  function clearTimer(): void {
    if (!saveTimer.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
  }

  function enqueueUpdate(
    patch: Partial<BookNote>,
    options?: BookNoteUpdateOptions,
  ): Promise<boolean> {
    const run = () => updateValue.current(note.id, patch, options);
    const next = updateQueue.current.then(run, run);
    updateQueue.current = next.catch(() => false);
    return next;
  }

  function finishSuccessfulSave(saved: ReadingDraft): void {
    savedDocument.current = saved;
    if (isClean(draftDocument.current, saved)) removeDraft(note.id);
  }

  function flushDocument(options?: BookNoteUpdateOptions): Promise<boolean> {
    if (readOnlyValue.current) {
      return Promise.resolve(isClean(draftDocument.current, savedDocument.current));
    }
    clearTimer();
    if (saveLoop.current) return saveLoop.current;

    const pending = (async () => {
      let lastSaveWorked = true;

      while (true) {
        const draft = { ...draftDocument.current };
        const saved = savedDocument.current;
        const nextBody = draft.body.trim();
        const nextPage = draft.page.trim();
        const nextPageEnd = draft.pageEnd.trim();
        const bodyChanged = Boolean(nextBody) && nextBody !== saved.body;
        const notesChanged = draft.notes !== saved.notes;
        const pageChanged = nextPage !== saved.page;
        const pageEndChanged = nextPageEnd !== saved.pageEnd;

        if (!bodyChanged && !notesChanged && !pageChanged && !pageEndChanged) {
          if (nextBody && isClean(draft, saved)) removeDraft(note.id);
          break;
        }

        const patch: Partial<BookNote> = {};
        if (bodyChanged) patch.body = nextBody;
        if (notesChanged) patch.notes = draft.notes;
        if (pageChanged) patch.page = nextPage;
        if (pageEndChanged) patch.pageEnd = nextPageEnd;

        if (Object.keys(patch).length === 0) {
          lastSaveWorked = false;
          break;
        }

        if (!options?.background) setStatus("saving");
        const worked = await enqueueUpdate(patch, options);
        if (!worked) {
          lastSaveWorked = false;
          break;
        }

        finishSuccessfulSave({
          body: bodyChanged ? nextBody : saved.body,
          notes: notesChanged ? draft.notes : saved.notes,
          page: pageChanged ? nextPage : saved.page,
          pageEnd: pageEndChanged ? nextPageEnd : saved.pageEnd,
        });
      }

      const clean = isClean(draftDocument.current, savedDocument.current);
      setStatus(clean ? "saved" : lastSaveWorked ? "unsaved" : "error");
      return lastSaveWorked && clean;
    })();

    saveLoop.current = pending.finally(() => {
      saveLoop.current = null;
    });
    return saveLoop.current;
  }

  function scheduleSave(): void {
    clearTimer();
    if (readOnlyValue.current || isClean(draftDocument.current, savedDocument.current)) return;
    saveTimer.current = setTimeout(() => void flushDocument(), SAVE_DELAY);
  }

  function changeDocument(patch: Partial<ReadingDraft>): void {
    const next = { ...draftDocument.current, ...patch };
    draftDocument.current = next;
    storeDraft(note.id, next);
    if (readOnlyValue.current) return;
    setStatus(isClean(next, savedDocument.current) ? "saved" : "unsaved");
    scheduleSave();
  }

  function changeBody(value: string): void {
    setBody(value);
    changeDocument({ body: value });
  }

  function changeNotes(value: string): void {
    setNotes(value);
    changeDocument({ notes: value });
  }

  function changePage(value: string): void {
    setPage(value);
    changeDocument({ page: value });
  }

  function changePageEnd(value: string): void {
    setPageEnd(value);
    changeDocument({ pageEnd: value });
  }

  function blurBody(): void {
    if (readOnlyValue.current) return;
    const next = draftDocument.current.body.trim();
    if (!next) {
      const restored = savedDocument.current.body;
      setBody(restored);
      draftDocument.current = { ...draftDocument.current, body: restored };
      storeDraft(note.id, draftDocument.current);
    } else if (next !== draftDocument.current.body) {
      setBody(next);
      draftDocument.current = { ...draftDocument.current, body: next };
      storeDraft(note.id, draftDocument.current);
    }
    void flushDocument();
  }

  // Leaving is immediate: the save runs alongside the transition instead of
  // holding the tap until the network answers. The draft is already on this
  // device, and a failed save still reports through the app-level banner.
  function goBack(): void {
    if (!draftDocument.current.body.trim()) {
      const restored = savedDocument.current.body;
      setBody(restored);
      draftDocument.current = { ...draftDocument.current, body: restored };
      storeDraft(note.id, draftDocument.current);
    }
    if (!readOnlyValue.current) void flushDocument();
    onBack();
  }

  useEffect(() => {
    mounted.current = true;
    if (isClean(draftDocument.current, savedDocument.current)) {
      removeDraft(note.id);
    } else {
      storeDraft(note.id, draftDocument.current);
      scheduleSave();
    }

    const flushBeforeSuspending = () => {
      if (document.visibilityState === "hidden") {
        void flushDocument({ background: true, keepalive: true });
      }
    };
    const flushBeforeLeaving = () => {
      void flushDocument({ background: true, keepalive: true });
    };

    document.addEventListener("visibilitychange", flushBeforeSuspending);
    window.addEventListener("pagehide", flushBeforeLeaving);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", flushBeforeSuspending);
      window.removeEventListener("pagehide", flushBeforeLeaving);
      clearTimer();
      void flushDocument({ background: true, keepalive: true });
    };
    // The note id is stable for this component's keyed lifetime. Refs keep the
    // latest read-only and update callback values available to lifecycle events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const statusCopy = readOnly
    ? "Read only while offline"
    : saveState === "saving"
      ? "Saving…"
      : saveState === "unsaved"
        ? "Saving soon…"
        : saveState === "error"
          ? "Not saved — kept on this device"
          : "Autosaved";

  return (
    <motion.section
      className="reading-detail"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={snappy}
      aria-label={`Reading note for ${book.title}: ${note.body}`}
    >
      <header className="task-detail-bar reading-detail-bar">
        <button className="task-back pressable" onClick={goBack} aria-label={`Back to ${book.title}`}>
          <ChevronLeftIcon size={17} />
          <span>Back to book</span>
        </button>
        <span className="task-context reading-context">
          <span className="q-glyph" aria-hidden="true">
            <BookGlyph size={15} />
          </span>
          <strong>{book.title}</strong>
          <em>Reading note</em>
        </span>
        <span className={`task-save-state save-${saveState}`} role="status" aria-live="polite">
          <i aria-hidden="true" />
          {statusCopy}
        </span>
      </header>

      <div className="task-paper reading-paper card">
        <article className="task-document reading-document">
          <span className="reading-kicker">Main idea</span>
          <textarea
            className="task-title-editor reading-title-editor"
            value={body}
            rows={2}
            maxLength={4000}
            onChange={(event) => changeBody(event.target.value)}
            onBlur={blurBody}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            aria-label="Reading note main idea"
            disabled={readOnly}
          />

          <div className="task-meta-row reading-meta-row">
            <span className={`reading-page-control ${readOnly ? "is-disabled" : ""}`}>
              <span className="reading-pages-label">Pages</span>
              <input
                value={page}
                maxLength={40}
                inputMode="numeric"
                onChange={(event) => changePage(event.target.value)}
                onBlur={() => void flushDocument()}
                placeholder="From"
                aria-label="Starting page, optional"
                disabled={readOnly}
              />
              <span aria-hidden="true">–</span>
              <input
                value={pageEnd}
                maxLength={40}
                inputMode="numeric"
                onChange={(event) => changePageEnd(event.target.value)}
                onBlur={() => void flushDocument()}
                placeholder="To"
                aria-label="Ending page, optional"
                disabled={readOnly}
              />
            </span>
            <span className="task-meta-note">
              Captured {formatDate(note.dayKey, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>

          <div className="task-notes-label reading-notes-label">
            <NoteIcon size={15} />
            <span>Expand the idea</span>
          </div>
          <textarea
            className="task-notes-editor reading-notes-editor"
            value={notes}
            maxLength={100000}
            onChange={(event) => changeNotes(event.target.value)}
            placeholder="Add the argument, useful quotes, questions, connections, or what you want to remember…"
            aria-label="Reading note content"
            disabled={readOnly}
          />
        </article>
      </div>
    </motion.section>
  );
}
