"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ageLabel, daysBetween } from "./date-keys";
import { CheckIcon, CloseIcon, PencilIcon, QuadrantGlyph, TrashIcon } from "./icons";
import { QUADRANTS, QUADRANT_LABELS, Quadrant } from "./quadrants";
import { gentle, snappy } from "./springs";
import type { Thought } from "./types";

type Props = {
  thought: Thought;
  today: string;
  showQuadrant?: boolean;
  showAge?: boolean;
  onUpdate: (id: string, patch: Partial<Thought>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const BURST_RAYS = 7;

export function ThoughtRow({ thought, today, showQuadrant, showAge, onUpdate, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
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
    if (!thought.done) setBurst((count) => count + 1);
    void onUpdate(thought.id, { done: !thought.done });
  }

  const age = daysBetween(thought.dayKey, today);
  const heat = thought.done || !showAge ? "" : age >= 7 ? "heat-2" : age >= 3 ? "heat-1" : "";

  return (
    <motion.li
      className={`thought ${thought.done ? "is-done" : ""}`}
      layout
      layoutId={`thought-${thought.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={snappy}
    >
      <div className="thought-main">
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
              <button
                className="icon-action pressable"
                onClick={() => void save()}
                aria-label="Save"
                title="Save"
              >
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
              {showQuadrant && (
                <span className={`quadrant-tag q-${thought.quadrant}`}>
                  <QuadrantGlyph quadrant={thought.quadrant} size={11} />
                  {QUADRANT_LABELS[thought.quadrant]}
                </span>
              )}
              {showAge && <span className={`thought-age ${heat}`}>{ageLabel(thought.dayKey, today)}</span>}
            </div>
          </div>
        )}

        {!editing && (
          <button
            className={`more ${expanded ? "more-open" : ""}`}
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Hide actions" : "Show actions"}
            aria-expanded={expanded}
          >
            ⋯
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && !editing && (
          <motion.div
            className="thought-actions"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={gentle}
            style={{ overflow: "hidden" }}
          >
            <span>Move to</span>
            {QUADRANTS.filter((quadrant) => quadrant !== thought.quadrant).map((quadrant: Quadrant) => (
              <button
                key={quadrant}
                className={`move-chip q-${quadrant} pressable`}
                onClick={() => {
                  setExpanded(false);
                  void onUpdate(thought.id, { quadrant });
                }}
              >
                <QuadrantGlyph quadrant={quadrant} size={11} />
                {QUADRANT_LABELS[quadrant]}
              </button>
            ))}
            <button
              className="icon-action pressable"
              onClick={() => {
                setExpanded(false);
                startEditing();
              }}
              aria-label="Edit"
              title="Edit"
            >
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
