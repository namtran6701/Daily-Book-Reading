"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeftIcon, NoteIcon, QuadrantGlyph, TodayIcon } from "./icons";
import { formatDate } from "@/lib/date-keys";
import { QUADRANT_AXES, QUADRANT_LABELS } from "@/lib/quadrants";
import { gentle } from "@/lib/springs";
import type { Thought } from "@/lib/types";

type SaveState = "saved" | "unsaved" | "saving" | "error";

export type ThoughtUpdateOptions = {
  background?: boolean;
  keepalive?: boolean;
};

type Props = {
  thought: Thought;
  readOnly?: boolean;
  onBack: () => void;
  onUpdate: (
    id: string,
    patch: Partial<Thought>,
    options?: ThoughtUpdateOptions,
  ) => Promise<boolean>;
};

type DocumentDraft = {
  title: string;
  notes: string;
  dayKey: string;
};

const SAVE_DELAY = 700;
const DRAFT_PREFIX = "second-brain-task-draft:";

function draftKey(id: string): string {
  return `${DRAFT_PREFIX}${id}`;
}

function readDraft(id: string, fallback: DocumentDraft): DocumentDraft {
  try {
    const value = localStorage.getItem(draftKey(id));
    if (!value) return fallback;
    const parsed = JSON.parse(value) as Partial<DocumentDraft>;
    if (typeof parsed.title !== "string" || typeof parsed.notes !== "string") return fallback;
    return {
      title: parsed.title,
      notes: parsed.notes,
      dayKey: typeof parsed.dayKey === "string" ? parsed.dayKey : fallback.dayKey,
    };
  } catch {
    return fallback;
  }
}

function storeDraft(id: string, draft: DocumentDraft): void {
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
    // A stale local draft is harmless and will be reconciled when this task reopens.
  }
}

function isClean(draft: DocumentDraft, saved: DocumentDraft): boolean {
  return (
    draft.title.trim() === saved.title &&
    draft.notes === saved.notes &&
    draft.dayKey === saved.dayKey
  );
}

export function TaskDetail({ thought, readOnly, onBack, onUpdate }: Props) {
  const [initialDraft] = useState(() =>
    readDraft(thought.id, { title: thought.body, notes: thought.notes, dayKey: thought.dayKey }),
  );
  const [title, setTitle] = useState(initialDraft.title);
  const [notes, setNotes] = useState(initialDraft.notes);
  const [dueDate, setDueDate] = useState(initialDraft.dayKey);
  const [saveState, setSaveState] = useState<SaveState>(() =>
    isClean(initialDraft, { title: thought.body, notes: thought.notes, dayKey: thought.dayKey })
      ? "saved"
      : "unsaved",
  );
  const savedDocument = useRef<DocumentDraft>({
    title: thought.body,
    notes: thought.notes,
    dayKey: thought.dayKey,
  });
  const draftDocument = useRef<DocumentDraft>(initialDraft);
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
    patch: Partial<Thought>,
    options?: ThoughtUpdateOptions,
  ): Promise<boolean> {
    const run = () => updateValue.current(thought.id, patch, options);
    const next = updateQueue.current.then(run, run);
    updateQueue.current = next.catch(() => false);
    return next;
  }

  function finishSuccessfulSave(saved: DocumentDraft): void {
    savedDocument.current = saved;
    if (isClean(draftDocument.current, saved)) removeDraft(thought.id);
  }

  function flushDocument(options?: ThoughtUpdateOptions): Promise<boolean> {
    if (readOnlyValue.current) return Promise.resolve(isClean(draftDocument.current, savedDocument.current));
    clearTimer();
    if (saveLoop.current) return saveLoop.current;

    const pending = (async () => {
      let lastSaveWorked = true;

      while (true) {
        const draft = { ...draftDocument.current };
        const saved = savedDocument.current;
        const nextTitle = draft.title.trim();
        const titleChanged = Boolean(nextTitle) && nextTitle !== saved.title;
        const notesChanged = draft.notes !== saved.notes;
        const dueDateChanged = draft.dayKey !== saved.dayKey;

        if (!titleChanged && !notesChanged && !dueDateChanged) {
          if (nextTitle && isClean(draft, saved)) removeDraft(thought.id);
          break;
        }

        const patch: Partial<Thought> = {};
        if (titleChanged) patch.body = nextTitle;
        if (notesChanged) patch.notes = draft.notes;
        if (dueDateChanged) patch.dayKey = draft.dayKey;

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
          title: titleChanged ? nextTitle : saved.title,
          notes: notesChanged ? draft.notes : saved.notes,
          dayKey: dueDateChanged ? draft.dayKey : saved.dayKey,
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

  function changeDocument(patch: Partial<DocumentDraft>): void {
    const next = { ...draftDocument.current, ...patch };
    draftDocument.current = next;
    storeDraft(thought.id, next);
    if (readOnlyValue.current) return;
    setStatus(isClean(next, savedDocument.current) ? "saved" : "unsaved");
    scheduleSave();
  }

  function changeTitle(value: string): void {
    setTitle(value);
    changeDocument({ title: value });
  }

  function changeNotes(value: string): void {
    setNotes(value);
    changeDocument({ notes: value });
  }

  function changeDueDate(value: string): void {
    setDueDate(value);
    changeDocument({ dayKey: value });
  }

  function blurTitle(): void {
    if (readOnlyValue.current) return;
    const next = draftDocument.current.title.trim();
    if (!next) {
      const restored = savedDocument.current.title;
      setTitle(restored);
      draftDocument.current = { ...draftDocument.current, title: restored };
      storeDraft(thought.id, draftDocument.current);
    } else if (next !== draftDocument.current.title) {
      setTitle(next);
      draftDocument.current = { ...draftDocument.current, title: next };
      storeDraft(thought.id, draftDocument.current);
    }
    void flushDocument();
  }

  async function goBack(): Promise<void> {
    if (!draftDocument.current.title.trim()) {
      const restored = savedDocument.current.title;
      setTitle(restored);
      draftDocument.current = { ...draftDocument.current, title: restored };
      storeDraft(thought.id, draftDocument.current);
    }
    if (!readOnlyValue.current && !(await flushDocument())) return;
    onBack();
  }

  useEffect(() => {
    mounted.current = true;
    if (isClean(draftDocument.current, savedDocument.current)) {
      removeDraft(thought.id);
    } else {
      storeDraft(thought.id, draftDocument.current);
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
    // The task id is stable for this component's keyed lifetime. Refs keep the
    // latest read-only and update callback values available to lifecycle events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thought.id]);

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
      className={`task-detail q-${thought.quadrant}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={gentle}
      aria-label={`Task details for ${thought.body}`}
    >
      <header className="task-detail-bar">
        <button className="task-back pressable" onClick={() => void goBack()} aria-label="Back to Quadrant">
          <ChevronLeftIcon size={17} />
          <span>Back to Quadrant</span>
        </button>
        <span className={`task-save-state save-${saveState}`} role="status" aria-live="polite">
          <i aria-hidden="true" />
          {statusCopy}
        </span>
      </header>

      <div className="task-paper card">
        <aside className="task-properties" aria-label="Task properties">
          <div className="task-property-heading">
            <span className="q-glyph" aria-hidden="true">
              <QuadrantGlyph quadrant={thought.quadrant} size={17} />
            </span>
            <div>
              <strong>{QUADRANT_LABELS[thought.quadrant]}</strong>
              <span>{QUADRANT_AXES[thought.quadrant]}</span>
            </div>
          </div>

          <label className="task-property">
            <span>
              <TodayIcon size={14} />
              Due date
            </span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => {
                if (event.target.value) changeDueDate(event.target.value);
              }}
              disabled={readOnly}
            />
          </label>

          <div className="task-created">
            Added {formatDate(thought.createdAt.slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </aside>

        <article className="task-document">
          <textarea
            className="task-title-editor"
            value={title}
            rows={2}
            maxLength={4000}
            onChange={(event) => changeTitle(event.target.value)}
            onBlur={blurTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            aria-label="Task title"
            disabled={readOnly}
          />

          <div className="task-notes-label">
            <NoteIcon size={15} />
            <span>Notes</span>
          </div>
          <textarea
            className="task-notes-editor"
            value={notes}
            maxLength={100000}
            onChange={(event) => changeNotes(event.target.value)}
            placeholder="Add context, links, meeting notes, or anything else this task needs…"
            aria-label="Task notes"
            disabled={readOnly}
          />
        </article>
      </div>
    </motion.section>
  );
}
