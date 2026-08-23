"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ageLabel, daysBetween } from "@/lib/date-keys";
import { CheckIcon, CloseIcon, MoveIcon, PencilIcon, QuadrantGlyph, TrashIcon } from "./icons";
import { QUADRANT_LABELS } from "@/lib/quadrants";
import { snappy } from "@/lib/springs";
import type { Thought } from "@/lib/types";

type Props = {
  thought: Thought;
  today: string;
  showQuadrant?: boolean;
  showAge?: boolean;
  onUpdate: (id: string, patch: Partial<Thought>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMove?: (id: string) => void;
  // Desktop-only native drag between quadrant cards. Touch never engages this,
  // so there is no custom touch-drag code and nothing to lag.
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
};

const BURST_RAYS = 7;

function haptic(pattern: number) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration is best-effort and unsupported on most desktops.
  }
}

export function ThoughtRow({
  thought,
  today,
  showQuadrant,
  showAge,
  onUpdate,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
  isDragging,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thought.body);
  const [burst, setBurst] = useState(0);
  const editor = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) editor.current?.focus();
  }, [editing]);

  async function save() {
    const body = draft.trim();
    setEditing(false);
    if (!body || body === thought.body) {
      setDraft(thought.body);
      return;
    }
    await onUpdate(thought.id, { body });
  }

  function startEditing() {
    setDraft(thought.body);
    setEditing(true);
  }

  function toggleDone() {
    if (!thought.done) {
      setBurst((count) => count + 1);
      haptic(12);
    }
    void onUpdate(thought.id, { done: !thought.done });
  }

  const age = daysBetween(thought.dayKey, today);
  const heat = thought.done || !showAge ? "" : age >= 7 ? "heat-2" : age >= 3 ? "heat-1" : "";
  const movableTag = showQuadrant && onMove;

  return (
    <motion.li
      className={`thought q-${thought.quadrant} ${thought.done ? "is-done" : ""} ${isDragging ? "dragging" : ""}`}
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={snappy}
    >
      <div
        className="thought-main"
        draggable={!!onDragStart && !editing}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", thought.id);
          onDragStart?.(thought.id);
        }}
        onDragEnd={() => onDragEnd?.()}
      >
        <motion.button
          className={`mark ${thought.done ? "mark-done" : ""}`}
          onClick={toggleDone}
          whileTap={{ scale: 0.8 }}
          transition={snappy}
          aria-label={thought.done ? "Mark as not done" : "Mark as done"}
          title={thought.done ? "Mark as not done" : "Mark as done"}
        >
          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" aria-hidden="true">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: thought.done ? 1 : 0, opacity: thought.done ? 1 : 0 }}
              transition={{ duration: 0.3, ease: [0.3, 0, 0.2, 1] }}
            />
          </svg>
          {burst > 0 && (
            <span key={burst} className="burst" aria-hidden="true">
              {Array.from({ length: BURST_RAYS }, (_, index) => (
                <i key={index} style={{ "--ray": `${(360 / BURST_RAYS) * index}deg` } as React.CSSProperties} />
              ))}
            </span>
          )}
        </motion.button>

        {editing ? (
          <div className="thought-editor">
            <textarea
              ref={editor}
              value={draft}
              rows={2}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void save();
                }
                if (event.key === "Escape") {
                  setDraft(thought.body);
                  setEditing(false);
                }
              }}
              aria-label="Edit this thought"
            />
            <div className="editor-actions">
              <button className="icon-action pressable" onClick={() => void save()} aria-label="Save" title="Save">
                <CheckIcon />
              </button>
              <button
                className="icon-action quiet pressable"
                onClick={() => {
                  setDraft(thought.body);
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
          <div className="thought-body">
            <p>{thought.body}</p>
            <div className="thought-meta">
              {showQuadrant &&
                (movableTag ? (
                  <button
                    className={`quadrant-tag q-${thought.quadrant}`}
                    onClick={() => onMove!(thought.id)}
                    aria-label={`In ${QUADRANT_LABELS[thought.quadrant]}. Move to another quadrant`}
                  >
                    <QuadrantGlyph quadrant={thought.quadrant} size={11} />
                    {QUADRANT_LABELS[thought.quadrant]}
                    <span className="caret" aria-hidden="true">
                      ⌄
                    </span>
                  </button>
                ) : (
                  <span className={`quadrant-tag q-${thought.quadrant}`}>
                    <QuadrantGlyph quadrant={thought.quadrant} size={11} />
                    {QUADRANT_LABELS[thought.quadrant]}
                  </span>
                ))}
              {showAge && <span className={`thought-age ${heat}`}>{ageLabel(thought.dayKey, today)}</span>}
            </div>
          </div>
        )}

        {!editing && (
          <div className="row-actions">
            {onMove && !showQuadrant && (
              <button
                className="icon-action pressable"
                onClick={() => onMove(thought.id)}
                aria-label="Move to another quadrant"
                title="Move"
              >
                <MoveIcon />
              </button>
            )}
            <button className="icon-action pressable" onClick={startEditing} aria-label="Edit" title="Edit">
              <PencilIcon />
            </button>
            <button
              className="icon-action danger pressable"
              onClick={() => void onDelete(thought.id)}
              aria-label="Delete"
              title="Delete"
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </div>
    </motion.li>
  );
}
