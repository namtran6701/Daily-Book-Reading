"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "motion/react";
import { QuadrantGlyph } from "./icons";
import { QUADRANTS, QUADRANT_LABELS, Quadrant } from "@/lib/quadrants";
import { ageLabel, formatDate, monthLabel, monthKey, rangeDays, shiftDate, startOfMonth, startOfWeek } from "@/lib/date-keys";
import { gentle } from "@/lib/springs";
import type { Book, BookNote, Thought } from "@/lib/types";

type Props = {
  thoughts: Thought[];
  books: Book[];
  notes: BookNote[];
  today: string;
};

type Range = "week" | "month";

function CountUp({ value }: { value: number }) {
  const node = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const target = node.current;
    if (!target) return;
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.22, 0.9, 0.24, 1],
      onUpdate: (latest) => {
        target.textContent = String(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [value]);
  return <span ref={node}>0</span>;
}

const QUADRANT_ORDER: Record<Quadrant, number> = { do: 0, plan: 1, quick: 2, later: 3 };

export function ReviewTab({ thoughts, books, notes, today }: Props) {
  const [range, setRange] = useState<Range>("week");

  const review = useMemo(() => {
    const start = range === "week" ? startOfWeek(today) : startOfMonth(today);
    const prevEnd = shiftDate(start, -1);
    const prevStart = range === "week" ? shiftDate(start, -7) : startOfMonth(prevEnd);

    const doneDay = (thought: Thought) => thought.doneAt?.slice(0, 10) ?? "";
    const inRange = (day: string, from: string, to: string) => day >= from && day <= to;

    const completed = thoughts
      .filter((thought) => thought.done && inRange(doneDay(thought), start, today))
      .sort((a, b) => doneDay(b).localeCompare(doneDay(a)));
    const prevCompleted = thoughts.filter(
      (thought) => thought.done && inRange(doneDay(thought), prevStart, prevEnd),
    ).length;

    const captured = thoughts.filter((thought) => inRange(thought.dayKey, start, today)).length;
    const notesInRange = notes.filter((note) => inRange(note.dayKey, start, today)).length;
    const booksFinished = books.filter(
      (book) => book.finishedAt && inRange(book.finishedAt.slice(0, 10), start, today),
    ).length;

    const open = thoughts.filter((thought) => !thought.done);
    const rate = completed.length + open.length === 0 ? 0 : completed.length / (completed.length + open.length);

    const byQuadrant = QUADRANTS.map((quadrant) => ({
      quadrant,
      done: completed.filter((thought) => thought.quadrant === quadrant).length,
      open: open.filter((thought) => thought.quadrant === quadrant).length,
    }));
    const maxBar = Math.max(1, ...byQuadrant.map((row) => row.done + row.open));

    const activityEnd = range === "week" ? shiftDate(start, 6) : today;
    const activity = rangeDays(start, activityEnd).map((day) => {
      const count =
        thoughts.filter((thought) => thought.dayKey === day || doneDay(thought) === day).length +
        notes.filter((note) => note.dayKey === day).length;
      return { day, count };
    });
    const maxActivity = Math.max(1, ...activity.map((cell) => cell.count));

    const carryover = open
      .filter((thought) => thought.dayKey < start)
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

    const upNext = [...open]
      .sort(
        (a, b) =>
          QUADRANT_ORDER[a.quadrant] - QUADRANT_ORDER[b.quadrant] || a.dayKey.localeCompare(b.dayKey),
      )
      .slice(0, 6);

    return {
      start,
      completed,
      prevCompleted,
      captured,
      notesInRange,
      booksFinished,
      open,
      rate,
      byQuadrant,
      maxBar,
      activity,
      maxActivity,
      carryover,
      upNext,
    };
  }, [range, thoughts, books, notes, today]);

  const delta = review.completed.length - review.prevCompleted;
  const rangeLabel =
    range === "week"
      ? `${formatDate(review.start, { month: "short", day: "numeric" })} – ${formatDate(today, { month: "short", day: "numeric" })}`
      : monthLabel(monthKey(today));
  const prevName = range === "week" ? "last week" : "last month";

  return (
    <div className="review">
      <header className="review-head">
        <div>
          <h2>The recap</h2>
          <span className="range-label">{rangeLabel}</span>
        </div>
        <div className="range-toggle" role="group" aria-label="Review range">
          {(["week", "month"] as const).map((value) => (
            <button
              key={value}
              className={`range-btn ${range === value ? "active" : ""}`}
              onClick={() => setRange(value)}
              aria-pressed={range === value}
            >
              {range === value && <motion.span className="range-pill" layoutId="range-pill" transition={gentle} />}
              <span>{value === "week" ? "This week" : "This month"}</span>
            </button>
          ))}
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={range}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={gentle}
        >
          <div className="stat-grid">
            <div className="stat-card ring-card card">
              <span className="ring-wrap" aria-hidden="true">
                <svg viewBox="0 0 120 120" className="ring-svg">
                  <circle className="ring-track" cx="60" cy="60" r="52" />
                  <motion.circle
                    className="ring-fill"
                    cx="60"
                    cy="60"
                    r="52"
                    pathLength={1}
                    strokeDasharray="1 1"
                    initial={{ strokeDashoffset: 1 }}
                    animate={{ strokeDashoffset: 1 - review.rate }}
                    transition={{ type: "spring", stiffness: 60, damping: 20, delay: 0.15 }}
                  />
                </svg>
                <span className="ring-value">
                  <CountUp value={Math.round(review.rate * 100)} />%
                </span>
              </span>
              <span className="stat-label">of your plate cleared</span>
              <span className="stat-foot">
                {review.completed.length} done · {review.open.length} still open
              </span>
            </div>

            <div className="stat-card card">
              <span className="stat-value">
                <CountUp value={review.completed.length} />
              </span>
              <span className="stat-label">completed</span>
              <span className={`stat-foot ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
                {delta === 0 ? `same as ${prevName}` : `${delta > 0 ? "+" : ""}${delta} vs ${prevName}`}
              </span>
            </div>

            <div className="stat-card card">
              <span className="stat-value">
                <CountUp value={review.captured} />
              </span>
              <span className="stat-label">thoughts captured</span>
              <span className="stat-foot">out of your head</span>
            </div>

            <div className="stat-card card">
              <span className="stat-value">
                <CountUp value={review.notesInRange} />
              </span>
              <span className="stat-label">book notes</span>
              <span className="stat-foot">
                {review.booksFinished > 0
                  ? `${review.booksFinished} ${review.booksFinished === 1 ? "book" : "books"} finished`
                  : "keep reading"}
              </span>
            </div>
          </div>

          <section className="review-section card" aria-label="Progress by quadrant">
            <h3>Where the work landed</h3>
            <div className="quad-bars">
              {review.byQuadrant.map(({ quadrant, done, open }) => (
                <div key={quadrant} className="quad-bar-row">
                  <span className={`quad-bar-label q-${quadrant}`}>
                    <QuadrantGlyph quadrant={quadrant} size={12} />
                    {QUADRANT_LABELS[quadrant]}
                  </span>
                  <span className="quad-bar-track">
                    <motion.i
                      className={`quad-bar-fill q-${quadrant}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(done / review.maxBar) * 100}%` }}
                      transition={{ type: "spring", stiffness: 80, damping: 22, delay: 0.1 }}
                    />
                    <motion.i
                      className={`quad-bar-open q-${quadrant}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(open / review.maxBar) * 100}%` }}
                      transition={{ type: "spring", stiffness: 80, damping: 22, delay: 0.2 }}
                    />
                  </span>
                  <span className="quad-bar-count">
                    {done} done{open > 0 ? ` · ${open} open` : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="review-section card" aria-label="Daily activity">
            <h3>Your rhythm</h3>
            <div className={`heat-strip ${range === "month" ? "heat-month" : ""}`}>
              {review.activity.map(({ day, count }) => (
                <span
                  key={day}
                  className={`heat-cell level-${count === 0 ? 0 : Math.ceil((count / review.maxActivity) * 3)}${day === today ? " today" : ""}`}
                  title={`${formatDate(day, { month: "short", day: "numeric" })}: ${count} ${count === 1 ? "entry" : "entries"}${day === today ? " · today" : ""}`}
                >
                  {range === "week" && <em>{formatDate(day, { weekday: "narrow" })}</em>}
                </span>
              ))}
            </div>
          </section>

          {review.carryover.length > 0 && (
            <section className="review-section card" aria-label="Carried over">
              <h3>
                Still waiting <em>from before this {range}</em>
              </h3>
              <ul className="carry-list">
                {review.carryover.slice(0, 6).map((thought) => (
                  <li key={thought.id}>
                    <span className={`quadrant-tag q-${thought.quadrant}`}>
                      <QuadrantGlyph quadrant={thought.quadrant} size={11} />
                      {QUADRANT_LABELS[thought.quadrant]}
                    </span>
                    <p>{thought.body}</p>
                    <span className="carry-age">{ageLabel(thought.dayKey, today)}</span>
                  </li>
                ))}
              </ul>
              {review.carryover.length > 6 && (
                <p className="carry-more">…and {review.carryover.length - 6} more in the matrix.</p>
              )}
            </section>
          )}

          <section className="review-section card" aria-label="Up next">
            <h3>
              Up next <em>for the coming {range}</em>
            </h3>
            {review.upNext.length === 0 ? (
              <p className="empty-line">Nothing open. Your plate is clean: go read something.</p>
            ) : (
              <ul className="carry-list">
                {review.upNext.map((thought) => (
                  <li key={thought.id}>
                    <span className={`quadrant-tag q-${thought.quadrant}`}>
                      <QuadrantGlyph quadrant={thought.quadrant} size={11} />
                      {QUADRANT_LABELS[thought.quadrant]}
                    </span>
                    <p>{thought.body}</p>
                    <span className="carry-age">{ageLabel(thought.dayKey, today)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
