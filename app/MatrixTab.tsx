"use client";

import { useMemo, useState } from "react";
import { ThoughtRow } from "./ThoughtRow";
import { QUADRANTS, QUADRANT_AXES, QUADRANT_EMPTY, QUADRANT_LABELS, Quadrant } from "./quadrants";
import type { Thought } from "./types";

type Props = {
  thoughts: Thought[];
  today: string;
  busy: boolean;
  onCapture: (text: string, quadrant: Quadrant) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<Thought>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function byNewest(a: Thought, b: Thought): number {
  return b.dayKey.localeCompare(a.dayKey) || b.createdAt.localeCompare(a.createdAt);
}

export function MatrixTab({ thoughts, today, busy, onCapture, onUpdate, onDelete }: Props) {
  const [text, setText] = useState("");
  const [quadrant, setQuadrant] = useState<Quadrant | null>(null);
  const [showDone, setShowDone] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const map = new Map<Quadrant, { open: Thought[]; done: Thought[] }>(
      QUADRANTS.map((key) => [key, { open: [], done: [] }]),
    );
    for (const thought of thoughts) {
      const bucket = map.get(thought.quadrant);
      if (bucket) bucket[thought.done ? "done" : "open"].push(thought);
    }
    // Newest first, by the day shown on the row rather than the write time, so
    // the order always matches the ages the reader can see.
    for (const bucket of map.values()) {
      bucket.open.sort(byNewest);
      bucket.done.sort(byNewest);
    }
    return map;
  }, [thoughts]);

  async function keep() {
    if (!text.trim() || !quadrant) return;
    if (await onCapture(text, quadrant)) setText("");
  }

  return (
    <>
      <section className="capture" aria-label="Capture a thought">
        <h2>What is on your mind?</h2>
        <textarea
          value={text}
          rows={2}
          placeholder="Get it out of your head. One thought per line."
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void keep();
            }
          }}
          aria-label="Your thought"
        />
        <div className="capture-foot">
          <div className="quadrant-picker" role="group" aria-label="Where does this belong?">
            {QUADRANTS.map((key) => (
              <button
                key={key}
                className={quadrant === key ? "picked" : ""}
                onClick={() => setQuadrant(key)}
                aria-pressed={quadrant === key}
              >
                {QUADRANT_LABELS[key]}
              </button>
            ))}
          </div>
          <button
            className="keep-button"
            onClick={() => void keep()}
            disabled={busy || !text.trim() || !quadrant}
          >
            {busy ? "Keeping…" : "Keep it"}
          </button>
        </div>
        {!quadrant && text.trim() ? (
          <p className="capture-hint">Pick where it belongs, then press Enter.</p>
        ) : null}
      </section>

      <div className="matrix-axis" aria-hidden="true">
        <span>Urgent</span>
        <span>Not urgent</span>
      </div>

      <div className="matrix">
        {QUADRANTS.map((key) => {
          const bucket = grouped.get(key)!;
          const done = showDone[key] ?? false;
          return (
            <section key={key} className={`quadrant quadrant-${key}`} aria-label={QUADRANT_LABELS[key]}>
              <header>
                <h3>{QUADRANT_LABELS[key]}</h3>
                <span className="quadrant-axis">{QUADRANT_AXES[key]}</span>
                {bucket.open.length > 0 && <span className="quadrant-count">{bucket.open.length}</span>}
              </header>

              {bucket.open.length === 0 ? (
                <p className="empty-line">{QUADRANT_EMPTY[key]}</p>
              ) : (
                <ul className="thought-list">
                  {bucket.open.map((thought) => (
                    <ThoughtRow
                      key={thought.id}
                      thought={thought}
                      today={today}
                      showAge
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                    />
                  ))}
                </ul>
              )}

              {bucket.done.length > 0 && (
                <>
                  <button
                    className="done-toggle"
                    onClick={() => setShowDone({ ...showDone, [key]: !done })}
                    aria-expanded={done}
                  >
                    {done ? "Hide" : "Show"} {bucket.done.length} done
                  </button>
                  {done && (
                    <ul className="thought-list">
                      {bucket.done.map((thought) => (
                        <ThoughtRow
                          key={thought.id}
                          thought={thought}
                          today={today}
                          onUpdate={onUpdate}
                          onDelete={onDelete}
                        />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
