"use client";

import { useEffect, useRef, useState } from "react";
import { ageLabel } from "./date-keys";
import { CheckIcon, CloseIcon, PencilIcon, TrashIcon } from "./icons";
import { QUADRANTS, QUADRANT_LABELS, Quadrant } from "./quadrants";
import type { Thought } from "./types";

type Props = {
  thought: Thought;
  today: string;
  showQuadrant?: boolean;
  showAge?: boolean;
  onUpdate: (id: string, patch: Partial<Thought>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function ThoughtRow({ thought, today, showQuadrant, showAge, onUpdate, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thought.body);
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

  return (
    <li className={`thought ${thought.done ? "is-done" : ""}`}>
      <div className="thought-main">
        <button
          className={`mark ${thought.done ? "mark-done" : ""}`}
          onClick={() => onUpdate(thought.id, { done: !thought.done })}
          aria-label={thought.done ? "Mark as not done" : "Mark as done"}
          title={thought.done ? "Mark as not done" : "Mark as done"}
        >
          {thought.done ? "✓" : ""}
        </button>

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
                className="icon-action"
                onClick={() => void save()}
                aria-label="Save"
                title="Save"
              >
                <CheckIcon />
              </button>
              <button
                className="icon-action quiet"
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
              {showQuadrant && <span className="quadrant-tag">{QUADRANT_LABELS[thought.quadrant]}</span>}
              {showAge && <span>{ageLabel(thought.dayKey, today)}</span>}
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

      {expanded && !editing && (
        <div className="thought-actions">
          <span>Move to</span>
          {QUADRANTS.filter((quadrant) => quadrant !== thought.quadrant).map((quadrant: Quadrant) => (
            <button
              key={quadrant}
              className="text-button"
              onClick={() => {
                setExpanded(false);
                void onUpdate(thought.id, { quadrant });
              }}
            >
              {QUADRANT_LABELS[quadrant]}
            </button>
          ))}
          <button
            className="icon-action"
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
            className="icon-action danger"
            onClick={() => void onDelete(thought.id)}
            aria-label="Delete"
            title="Delete"
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </li>
  );
}
