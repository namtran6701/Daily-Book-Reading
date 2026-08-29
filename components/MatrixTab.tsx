"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ThoughtRow } from "./ThoughtRow";
import { ChevronDownIcon, ChevronRightIcon, CloseIcon, PlusIcon, QuadrantGlyph, SubmitIcon } from "./icons";
import {
  QUADRANTS,
  QUADRANT_AXES,
  QUADRANT_EMPTY,
  QUADRANT_LABELS,
  Quadrant,
  isQuadrant,
} from "@/lib/quadrants";
import { bouncy, gentle, snappy } from "@/lib/springs";
import type { Thought } from "@/lib/types";

type Props = {
  thoughts: Thought[];
  today: string;
  busy: boolean;
  readOnly?: boolean;
  onCapture: (text: string, quadrant: Quadrant) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<Thought>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  deletingIds: Set<string>;
};

const PREVIEW_COUNT = 2;
const STORE_KEY = "sb-last-quadrant";

function byNewest(a: Thought, b: Thought): number {
  return b.dayKey.localeCompare(a.dayKey) || b.createdAt.localeCompare(a.createdAt);
}

function readStoredQuadrant(): Quadrant {
  try {
    const value = localStorage.getItem(STORE_KEY);
    if (isQuadrant(value)) return value;
  } catch {
    // localStorage can be unavailable (private mode); fall back to a default.
  }
  return "do";
}

function haptic(pattern: number) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // best-effort only
  }
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

// Shared modal shell: scrim, Escape-to-close, backdrop tap, scroll lock.
function Overlay({
  center,
  label,
  onClose,
  children,
}: {
  center?: boolean;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const scrimRef = useRef<HTMLDivElement>(null);

  const focusable = useCallback(
    () =>
      Array.from(
        scrimRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled")),
    [],
  );

  // Mount-only: lock scroll, make the app behind the dialog inert (out of the tab
  // order and hidden from assistive tech; a depth counter keeps it inert while a
  // nested overlay is open), and set the initial focus. This must NOT re-run on
  // every render, or typing in the sheet would keep yanking focus back to the
  // first control and dismiss the keyboard.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const app = document.querySelector<HTMLElement>('[data-app="second-brain"]');
    if (app) {
      app.dataset.overlayDepth = String(Number(app.dataset.overlayDepth ?? "0") + 1);
      app.setAttribute("inert", "");
    }
    const restoreFocus = document.activeElement as HTMLElement | null;

    // Focus the first control (the close button), never the text field, so
    // opening the sheet doesn't pop the keyboard. The keyboard opens only when
    // the user taps the field themselves.
    (focusable()[0] ?? scrimRef.current)?.focus();

    return () => {
      document.body.style.overflow = previous;
      if (app) {
        const remaining = Number(app.dataset.overlayDepth ?? "1") - 1;
        if (remaining > 0) {
          app.dataset.overlayDepth = String(remaining);
        } else {
          delete app.dataset.overlayDepth;
          app.removeAttribute("inert");
        }
      }
      restoreFocus?.focus?.();
    };
  }, [focusable]);

  // Escape to close + Tab focus trap. Re-subscribes when onClose changes without
  // disturbing focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, focusable]);

  return createPortal(
    <motion.div
      ref={scrimRef}
      className={`scrim ${center ? "center" : ""}`}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {children}
    </motion.div>,
    document.body,
  );
}

export function MatrixTab({ thoughts, today, busy, readOnly, onCapture, onUpdate, onDelete, deletingIds }: Props) {
  const [text, setText] = useState("");
  // MatrixTab only mounts on the client (the tabs render after `today` resolves),
  // so reading the last-used quadrant here is safe and keeps capture to one tap.
  const [quadrant, setQuadrant] = useState<Quadrant>(readStoredQuadrant);
  const [showDone, setShowDone] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overQuad, setOverQuad] = useState<Quadrant | null>(null);
  const [sheetQuad, setSheetQuad] = useState<Quadrant | null>(null);
  const [sheetText, setSheetText] = useState("");
  const [moveId, setMoveId] = useState<string | null>(null);

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composerCardRef = useRef<HTMLElement>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [justAdded, setJustAdded] = useState<Quadrant | null>(null);

  useEffect(() => () => {
    if (addedTimer.current) clearTimeout(addedTimer.current);
  }, []);

  // Pulse the composer pill for the quadrant a capture just landed in.
  function flashAdded(key: Quadrant) {
    if (addedTimer.current) clearTimeout(addedTimer.current);
    setJustAdded(null);
    requestAnimationFrame(() => {
      setJustAdded(key);
      addedTimer.current = setTimeout(() => setJustAdded(null), 900);
    });
  }

  function pickQuadrant(next: Quadrant) {
    setQuadrant(next);
    try {
      localStorage.setItem(STORE_KEY, next);
    } catch {
      // ignore write failures in private mode
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<Quadrant, { open: Thought[]; done: Thought[] }>(
      QUADRANTS.map((key) => [key, { open: [], done: [] }]),
    );
    for (const thought of thoughts) {
      const bucket = map.get(thought.quadrant);
      if (bucket) bucket[thought.done ? "done" : "open"].push(thought);
    }
    for (const bucket of map.values()) {
      bucket.open.sort(byNewest);
      bucket.done.sort(byNewest);
    }
    return map;
  }, [thoughts]);

  function endDrag() {
    setDragId(null);
    setOverQuad(null);
  }

  function drop(target: Quadrant) {
    if (readOnly) return endDrag();
    const thought = thoughts.find((item) => item.id === dragId);
    if (thought && thought.quadrant !== target) void onUpdate(thought.id, { quadrant: target });
    endDrag();
  }

  async function keep() {
    if (busy || readOnly || !text.trim()) return;
    if (await onCapture(text, quadrant)) {
      setText("");
      haptic(8);
      flashAdded(quadrant);
    }
  }

  // One-click capture: with text in the composer, tapping a quadrant pill sends
  // straight into it (and remembers it as the default for the Enter/send path).
  // With an empty composer the pill just picks the default and focuses.
  async function pickOrSend(next: Quadrant) {
    if (readOnly) return;
    if (!text.trim()) {
      focusQuadrant(next);
      return;
    }
    if (busy) return;
    pickQuadrant(next);
    if (await onCapture(text, next)) {
      setText("");
      haptic(8);
      flashAdded(next);
    }
  }

  async function keepInSheet() {
    if (busy || readOnly || !sheetText.trim() || !sheetQuad) return;
    if (await onCapture(sheetText, sheetQuad)) {
      setSheetText("");
      haptic(8);
    }
  }

  function focusQuadrant(key: Quadrant) {
    pickQuadrant(key);
    const el = composerRef.current;
    if (!el) return;
    // If the composer is already on screen (mobile pill tap), a plain focus keeps
    // the tap gesture intact so iOS raises the keyboard. Never scroll here, a
    // programmatic scroll would swallow the keyboard.
    const top = el.getBoundingClientRect().top;
    if (top >= 0 && top <= window.innerHeight) {
      el.focus();
      return;
    }
    // Desktop "Add here" below the fold: focus without the browser's jump, then
    // glide the composer up to just below the sticky masthead.
    el.focus({ preventScroll: true });
    const card = composerCardRef.current;
    if (!card) return;
    const masthead = document.querySelector<HTMLElement>(".masthead");
    const gap = (masthead?.offsetHeight ?? 0) + 12;
    const target = card.getBoundingClientRect().top + window.scrollY - gap;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, target), behavior: reduce ? "auto" : "smooth" });
  }

  function moveTo(target: Quadrant) {
    const id = moveId;
    setMoveId(null);
    if (!id) return;
    const thought = thoughts.find((item) => item.id === id);
    if (thought && thought.quadrant !== target) {
      haptic(10);
      void onUpdate(id, { quadrant: target });
    }
  }

  const moving = moveId ? thoughts.find((item) => item.id === moveId) ?? null : null;
  const sheetBucket = sheetQuad ? grouped.get(sheetQuad)! : null;

  return (
    <>
      <section
        ref={composerCardRef}
        className={`composer card capture-${quadrant}`}
        aria-label="Capture a thought"
      >
        <div className="composer-field">
          <textarea
            ref={composerRef}
            value={text}
            rows={1}
            placeholder="What's on your mind?"
            enterKeyHint="send"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void keep();
              }
            }}
            aria-label="Your thought"
            disabled={readOnly}
          />
        </div>
        <div className={`composer-picker ${text.trim() ? "armed" : ""}`} role="group" aria-label="Priority">
          <span className="eyebrow">{text.trim() ? "Send to" : "Into"}</span>
          {QUADRANTS.map((key) => (
            <motion.button
              key={key}
              className={`pill q-${key} ${quadrant === key ? "picked" : ""} ${justAdded === key ? "just-added" : ""}`}
              onClick={() => void pickOrSend(key)}
              disabled={readOnly}
              whileTap={{ scale: 0.94 }}
              transition={bouncy}
              aria-pressed={quadrant === key}
              aria-label={text.trim() ? `Send to ${QUADRANT_LABELS[key]}` : QUADRANT_LABELS[key]}
            >
              <span className="pill-dot" aria-hidden="true" />
              <span>{QUADRANT_LABELS[key]}</span>
            </motion.button>
          ))}
        </div>
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
            const preview = bucket.open.slice(0, PREVIEW_COUNT);
            return (
              <section
                key={key}
                className={`quadrant card q-${key} ${dragId && overQuad === key ? "drop-active" : ""}`}
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

                {/* Desktop: the full, interactive list inside the quadrant card */}
                {bucket.open.length === 0 ? (
                  <p className="empty-line q-list">{QUADRANT_EMPTY[key]}</p>
                ) : (
                  <ul className="thought-list q-list">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {bucket.open.map((thought) => (
                        <ThoughtRow
                          key={thought.id}
                          thought={thought}
                          today={today}
                          showAge
                          onUpdate={onUpdate}
                          onDelete={onDelete}
                          deleting={deletingIds.has(thought.id)}
                          readOnly={readOnly}
                          onMove={setMoveId}
                          onDragStart={setDragId}
                          onDragEnd={endDrag}
                          isDragging={dragId === thought.id}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                )}

                <button className="q-add pressable" onClick={() => focusQuadrant(key)} disabled={readOnly}>
                  <PlusIcon size={14} />
                  Add here
                </button>

                {bucket.done.length > 0 && (
                  <>
                    <button
                      className={`done-toggle q-list ${done ? "done-toggle-open" : ""}`}
                      onClick={() => setShowDone({ ...showDone, [key]: !done })}
                      aria-expanded={done}
                    >
                      <ChevronDownIcon size={13} />
                      <span>{bucket.done.length} done</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {done && (
                        <motion.ul
                          className="thought-list done q-list"
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
                              deleting={deletingIds.has(thought.id)}
                              readOnly={readOnly}
                              onMove={setMoveId}
                            />
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {/* Mobile: a compact preview and a whole-tile button into the sheet */}
                <ul className="q-preview" aria-hidden="true">
                  {preview.length === 0 ? (
                    <li className="q-empty">{QUADRANT_EMPTY[key]}</li>
                  ) : (
                    preview.map((thought) => (
                      <li key={thought.id}>
                        <span>{thought.body}</span>
                      </li>
                    ))
                  )}
                </ul>
                <span className="q-open-cue" aria-hidden="true">
                  {bucket.open.length > 0 ? `View all ${bucket.open.length}` : "Add one"}
                  <ChevronRightIcon size={12} />
                </span>
                <button
                  className="q-open"
                  onClick={() => setSheetQuad(key)}
                  aria-label={`Open ${QUADRANT_LABELS[key]}: ${bucket.open.length} open`}
                />
              </section>
            );
          })}
        </div>
      </div>

      {/* Mobile quadrant sheet */}
      <AnimatePresence>
        {sheetQuad && sheetBucket && (
          <Overlay label={QUADRANT_LABELS[sheetQuad]} onClose={() => setSheetQuad(null)}>
            <motion.div
              className={`sheet q-${sheetQuad}`}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 40 }}
            >
              <div className="sheet-head">
                <span className="q-glyph" aria-hidden="true">
                  <QuadrantGlyph quadrant={sheetQuad} size={18} />
                </span>
                <div className="sheet-title">
                  <h2>{QUADRANT_LABELS[sheetQuad]}</h2>
                  <span>
                    {QUADRANT_AXES[sheetQuad]} · {sheetBucket.open.length} open
                  </span>
                </div>
                <button className="sheet-close pressable" onClick={() => setSheetQuad(null)} aria-label="Close">
                  <CloseIcon />
                </button>
              </div>

              <div className="sheet-body">
                <div className="sheet-composer">
                  <textarea
                    value={sheetText}
                    rows={1}
                    placeholder={`Add to ${QUADRANT_LABELS[sheetQuad]}...`}
                    enterKeyHint="send"
                    onChange={(event) => setSheetText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void keepInSheet();
                      }
                    }}
                    aria-label={`Add a thought to ${QUADRANT_LABELS[sheetQuad]}`}
                    disabled={readOnly}
                  />
                  <motion.button
                    className="composer-send"
                    onClick={() => void keepInSheet()}
                    disabled={busy || readOnly || !sheetText.trim()}
                    whileTap={{ scale: 0.86 }}
                    transition={bouncy}
                    aria-label="Add thought"
                  >
                    <SubmitIcon />
                  </motion.button>
                </div>

                {sheetBucket.open.length === 0 ? (
                  <p className="empty-line">{QUADRANT_EMPTY[sheetQuad]}</p>
                ) : (
                  <ul className="thought-list">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {sheetBucket.open.map((thought) => (
                        <ThoughtRow
                          key={thought.id}
                          thought={thought}
                          today={today}
                          showAge
                          onUpdate={onUpdate}
                          onDelete={onDelete}
                          deleting={deletingIds.has(thought.id)}
                          readOnly={readOnly}
                          onMove={setMoveId}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                )}

                {sheetBucket.done.length > 0 && (
                  <>
                    <button
                      className={`done-toggle ${showDone[sheetQuad] ? "done-toggle-open" : ""}`}
                      onClick={() => setShowDone({ ...showDone, [sheetQuad]: !showDone[sheetQuad] })}
                      aria-expanded={!!showDone[sheetQuad]}
                    >
                      <ChevronDownIcon size={13} />
                      <span>{sheetBucket.done.length} done</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {showDone[sheetQuad] && (
                        <motion.ul
                          className="thought-list done"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={gentle}
                          style={{ overflow: "hidden" }}
                        >
                          {sheetBucket.done.map((thought) => (
                            <ThoughtRow
                              key={thought.id}
                              thought={thought}
                              today={today}
                              onUpdate={onUpdate}
                              onDelete={onDelete}
                              deleting={deletingIds.has(thought.id)}
                              readOnly={readOnly}
                              onMove={setMoveId}
                            />
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </div>
            </motion.div>
          </Overlay>
        )}
      </AnimatePresence>

      {/* Move-to-quadrant menu (the single-pointer alternative to dragging) */}
      <AnimatePresence>
        {moving && (
          <Overlay center label="Move to" onClose={() => setMoveId(null)}>
            <motion.div
              className="card menu"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={snappy}
            >
              <h2>Move to</h2>
              <p className="menu-sub">{moving.body}</p>
              <div className="menu-grid">
                {QUADRANTS.map((key) => (
                  <motion.button
                    key={key}
                    className={`menu-option q-${key} ${moving.quadrant === key ? "current" : ""}`}
                    onClick={() => moveTo(key)}
                    disabled={readOnly}
                    whileTap={{ scale: 0.96 }}
                    transition={bouncy}
                  >
                    <span className="q-glyph" aria-hidden="true">
                      <QuadrantGlyph quadrant={key} size={15} />
                    </span>
                    <span>
                      {QUADRANT_LABELS[key]}
                      <small>{QUADRANT_AXES[key]}</small>
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </Overlay>
        )}
      </AnimatePresence>
    </>
  );
}
