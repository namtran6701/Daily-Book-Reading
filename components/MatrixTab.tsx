"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ThoughtRow } from "./ThoughtRow";
import { ChevronDownIcon, QuadrantGlyph, SubmitIcon } from "./icons";
import { QUADRANTS, QUADRANT_AXES, QUADRANT_EMPTY, QUADRANT_LABELS, Quadrant } from "@/lib/quadrants";
import { bouncy, gentle } from "@/lib/springs";
import type { Thought } from "@/lib/types";

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

function QuadrantRing({ open, done }: { open: number; done: number }) {
  const total = open + done;
  const progress = total === 0 ? 0 : done / total;
  return (
    <span className="q-ring" title={`${done} of ${total} done`}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="q-ring-track" cx="18" cy="18" r="15" />
        <motion.circle
          className="q-ring-fill"
          cx="18"
          cy="18"
          r="15"
          pathLength={1}
          strokeDasharray="1 1"
          initial={false}
          animate={{ strokeDashoffset: 1 - progress }}
          transition={{ type: "spring", stiffness: 120, damping: 26 }}
        />
      </svg>
      <b>{open}</b>
    </span>
  );
}

export function MatrixTab({ thoughts, today, busy, onCapture, onUpdate, onDelete }: Props) {
  const [text, setText] = useState("");
  const [quadrant, setQuadrant] = useState<Quadrant | null>(null);
  const [showDone, setShowDone] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overQuad, setOverQuad] = useState<Quadrant | null>(null);

  function endDrag() {
    setDragId(null);
    setOverQuad(null);
  }

  function drop(target: Quadrant) {
    const thought = thoughts.find((t) => t.id === dragId);
    if (thought && thought.quadrant !== target) void onUpdate(thought.id, { quadrant: target });
    endDrag();
  }

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
      <section className={`capture card ${quadrant ? `capture-${quadrant}` : ""}`} aria-label="Capture a thought">
        <h2>What&rsquo;s on your mind?</h2>
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
              <motion.button
                key={key}
                className={`chip q-${key} ${quadrant === key ? "picked" : ""}`}
                onClick={() => setQuadrant(key)}
                whileTap={{ scale: 0.92 }}
                transition={bouncy}
                aria-pressed={quadrant === key}
              >
                <QuadrantGlyph quadrant={key} />
                <span>{QUADRANT_LABELS[key]}</span>
              </motion.button>
            ))}
          </div>
          <motion.button
            className="keep-button"
            onClick={() => void keep()}
            disabled={busy || !text.trim() || !quadrant}
            whileTap={{ scale: 0.88 }}
            transition={bouncy}
            aria-label={busy ? "Submitting" : "Submit"}
            title="Submit"
          >
            <SubmitIcon />
          </motion.button>
        </div>
        <AnimatePresence>
          {!quadrant && text.trim() ? (
            <motion.p
              className="capture-hint"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={gentle}
            >
              Pick where it belongs, then press Enter.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </section>

      <div className="matrix-frame">
        <div className="matrix-cols" aria-hidden="true">
          <span>Urgent</span>
          <span>Not urgent</span>
        </div>
        <div className="matrix-rows" aria-hidden="true">
          <span>Important</span>
          <span>Not important</span>
        </div>

        <div className="matrix">
          {QUADRANTS.map((key) => {
            const bucket = grouped.get(key)!;
            const done = showDone[key] ?? false;
            return (
              <motion.section
                key={key}
                layout
                className={`quadrant card q-${key} ${dragId && overQuad === key ? "drop-active" : ""}`}
                transition={gentle}
                aria-label={QUADRANT_LABELS[key]}
                data-quadrant={key}
                onDragOver={(event) => {
                  if (!dragId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (overQuad !== key) setOverQuad(key);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  drop(key);
                }}
              >
                <header className="q-head">
                  <span className="q-glyph" aria-hidden="true">
                    <QuadrantGlyph quadrant={key} size={17} />
                  </span>
                  <div className="q-title">
                    <h3>{QUADRANT_LABELS[key]}</h3>
                    <span className="quadrant-axis">{QUADRANT_AXES[key]}</span>
                  </div>
                  <QuadrantRing open={bucket.open.length} done={bucket.done.length} />
                </header>

                {bucket.open.length === 0 ? (
                  <p className="empty-line">{QUADRANT_EMPTY[key]}</p>
                ) : (
                  <ul className="thought-list">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {bucket.open.map((thought) => (
                        <ThoughtRow
                          key={thought.id}
                          thought={thought}
                          today={today}
                          showAge
                          onUpdate={onUpdate}
                          onDelete={onDelete}
                          onDragStart={setDragId}
                          onDragEnd={endDrag}
                          onDragOverQuadrant={(q) => setOverQuad(q as Quadrant | null)}
                          onDropQuadrant={(q) => (q ? drop(q as Quadrant) : endDrag())}
                          isDragging={dragId === thought.id}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                )}

                {bucket.done.length > 0 && (
                  <>
                    <button
                      className={`done-toggle ${done ? "done-toggle-open" : ""}`}
                      onClick={() => setShowDone({ ...showDone, [key]: !done })}
                      aria-expanded={done}
                      aria-label={`${done ? "Hide" : "Show"} ${bucket.done.length} done`}
                      title={`${done ? "Hide" : "Show"} ${bucket.done.length} done`}
                    >
                      <ChevronDownIcon />
                      <span>{bucket.done.length} done</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {done && (
                        <motion.ul
                          className="thought-list"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={gentle}
                          style={{ overflow: "hidden" }}
                        >
                          {bucket.done.map((thought) => (
                            <ThoughtRow
                              key={thought.id}
                              thought={thought}
                              today={today}
                              onUpdate={onUpdate}
                              onDelete={onDelete}
                              onDragStart={setDragId}
                              onDragEnd={endDrag}
                              onDragOverQuadrant={(q) => setOverQuad(q as Quadrant | null)}
                              onDropQuadrant={(q) => (q ? drop(q as Quadrant) : endDrag())}
                              isDragging={dragId === thought.id}
                            />
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.section>
            );
          })}
        </div>
      </div>
    </>
  );
}
