"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { ageLabel, daysBetween } from "@/lib/date-keys";
import { CheckIcon, CloseIcon, PencilIcon, QuadrantGlyph, TrashIcon } from "./icons";
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
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  onDragOverQuadrant?: (quadrant: string | null) => void;
  onDropQuadrant?: (quadrant: string | null) => void;
  isDragging?: boolean;
};

const LONG_PRESS_MS = 400;
const SCROLL_SLOP = 10;

const BURST_RAYS = 7;

export function ThoughtRow({
  thought,
  today,
  showQuadrant,
  showAge,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverQuadrant,
  onDropQuadrant,
  isDragging,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thought.body);
  const [burst, setBurst] = useState(0);
  const editor = useRef<HTMLTextAreaElement>(null);

  // Touch: long-press to pick up, then drag onto another quadrant card. A
  // floating ghost follows the finger (the cards clip overflow, so the row
  // itself can't visibly cross between them).
  const pressTimer = useRef<number | null>(null);
  const startTouch = useRef<{ x: number; y: number } | null>(null);
  const lastQuad = useRef<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const touchDragging = ghost !== null;

  function clearPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  useEffect(() => clearPress, []);

  function engageTouchDrag() {
    const start = startTouch.current;
    if (!start) return;
    onDragStart?.(thought.id);
    setGhost(start);
    navigator.vibrate?.(10);

    const onMove = (event: TouchEvent) => {
      event.preventDefault();
      const touch = event.touches[0];
      if (!touch) return;
      setGhost({ x: touch.clientX, y: touch.clientY });
      const under = document.elementFromPoint(touch.clientX, touch.clientY);
      lastQuad.current = under?.closest("[data-quadrant]")?.getAttribute("data-quadrant") ?? null;
      onDragOverQuadrant?.(lastQuad.current);
    };
    const onEnd = () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      setGhost(null);
      onDropQuadrant?.(lastQuad.current);
      lastQuad.current = null;
      startTouch.current = null;
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
  }

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
      className={`thought ${thought.done ? "is-done" : ""} ${isDragging ? "dragging" : ""}`}
      layout
      layoutId={`thought-${thought.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
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
        onTouchStart={(event) => {
          if (!onDragStart || editing) return;
          if ((event.target as HTMLElement).closest("button")) return;
          const touch = event.touches[0];
          startTouch.current = { x: touch.clientX, y: touch.clientY };
          clearPress();
          pressTimer.current = window.setTimeout(engageTouchDrag, LONG_PRESS_MS);
        }}
        onTouchMove={(event) => {
          if (touchDragging || !startTouch.current) return;
          const touch = event.touches[0];
          if (
            Math.abs(touch.clientX - startTouch.current.x) > SCROLL_SLOP ||
            Math.abs(touch.clientY - startTouch.current.y) > SCROLL_SLOP
          ) {
            clearPress();
          }
        }}
        onTouchEnd={() => {
          if (!touchDragging) clearPress();
        }}
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
          <div className="row-actions">
            <button
              className="icon-action pressable"
              onClick={startEditing}
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
          </div>
        )}
      </div>

      {ghost &&
        createPortal(
          <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
            {thought.body}
          </div>,
          document.body,
        )}
    </motion.li>
  );
}
