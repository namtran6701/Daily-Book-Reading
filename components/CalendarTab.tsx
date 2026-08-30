"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ThoughtRow } from "./ThoughtRow";
import { QuietState } from "./UiState";
import { WEEKDAY_INITIALS, dayTitle, formatDate, monthGrid, monthKey, monthLabel } from "@/lib/date-keys";
import { TodayIcon } from "./icons";
import { gentle, snappy } from "@/lib/springs";
import type { Book, BookNote, Thought } from "@/lib/types";

type Props = {
  thoughts: Thought[];
  notes: BookNote[];
  books: Book[];
  today: string;
  month: string;
  selectedDay: string;
  onMonthChange: (direction: "previous" | "next") => void;
  onSelectDay: (day: string) => void;
  onUpdate: (id: string, patch: Partial<Thought>) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
  onOpenDetail: (id: string) => void;
  deletingIds: Set<string>;
  readOnly?: boolean;
};

const MAX_DOTS = 5;

export function CalendarTab({
  thoughts,
  notes,
  books,
  today,
  month,
  selectedDay,
  onMonthChange,
  onSelectDay,
  onUpdate,
  onDelete,
  onOpenDetail,
  deletingIds,
  readOnly,
}: Props) {
  // 1 = sliding toward the future, -1 toward the past; drives the grid swipe.
  const [direction, setDirection] = useState(1);

  const activity = useMemo(() => {
    const map = new Map<string, { scheduled: number; captured: number; notes: number }>();
    const bump = (day: string, field: "scheduled" | "captured" | "notes") => {
      const entry = map.get(day) ?? { scheduled: 0, captured: 0, notes: 0 };
      entry[field] += 1;
      map.set(day, entry);
    };
    for (const thought of thoughts) {
      if (thought.scheduledDayKey) bump(thought.scheduledDayKey, "scheduled");
      if (thought.capturedDayKey !== thought.scheduledDayKey) {
        bump(thought.capturedDayKey, "captured");
      }
    }
    for (const note of notes) bump(note.dayKey, "notes");
    return map;
  }, [thoughts, notes]);

  const cells = useMemo(() => monthGrid(month), [month]);

  const dayScheduled = useMemo(
    () =>
      thoughts
        .filter((thought) => thought.scheduledDayKey === selectedDay)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [thoughts, selectedDay],
  );

  const dayCaptured = useMemo(
    () =>
      thoughts
        .filter(
          (thought) =>
            thought.capturedDayKey === selectedDay && thought.scheduledDayKey !== selectedDay,
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [thoughts, selectedDay],
  );

  const dayReading = useMemo(() => {
    const groups = new Map<string, BookNote[]>();
    for (const note of notes) {
      if (note.dayKey !== selectedDay) continue;
      groups.set(note.bookId, [...(groups.get(note.bookId) ?? []), note]);
    }
    return Array.from(groups).map(([bookId, rows]) => ({
      book: books.find((entry) => entry.id === bookId) ?? null,
      rows: rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));
  }, [notes, books, selectedDay]);

  const readingCount = dayReading.reduce((total, group) => total + group.rows.length, 0);

  const isRelative =
    dayTitle(selectedDay, today) !== formatDate(selectedDay, { weekday: "long", month: "long", day: "numeric" });

  function changeMonth(target: "previous" | "next") {
    setDirection(target === "next" ? 1 : -1);
    onMonthChange(target);
  }

  function jumpToToday() {
    setDirection(monthKey(today) >= month ? 1 : -1);
    onSelectDay(today);
  }

  return (
    <div className="calendar-layout">
      <div className="calendar-col">
      <header className="month-header">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h2
            key={month}
            initial={{ opacity: 0, x: 18 * direction }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 * direction }}
            transition={snappy}
          >
            {monthLabel(month)}
          </motion.h2>
        </AnimatePresence>
        <div className="month-nav">
          <button
            className="icon-button pressable"
            onClick={() => changeMonth("previous")}
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            className="icon-button pressable"
            onClick={jumpToToday}
            aria-label="Today"
            title="Today"
          >
            <TodayIcon />
          </button>
          <button
            className="icon-button pressable"
            onClick={() => changeMonth("next")}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </header>

      <div className="calendar card calendar-card" role="grid" aria-label={`${monthLabel(month)} calendar`}>
        <div className="weekday-row" role="row">
          {WEEKDAY_INITIALS.map((initial, index) => (
            <span key={index} role="columnheader">
              {initial}
            </span>
          ))}
        </div>
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={month}
            className="day-grid"
            role="rowgroup"
            custom={direction}
            initial={{ opacity: 0, x: 56 * direction }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -56 * direction }}
            transition={snappy}
          >
            {Array.from({ length: cells.length / 7 }, (_, week) => (
              <div key={week} className="week-row" role="row">
                {cells.slice(week * 7, week * 7 + 7).map(({ dayKey, inMonth }) => {
                  const counts = activity.get(dayKey);
                  const total =
                    (counts?.scheduled ?? 0) +
                    (counts?.captured ?? 0) +
                    (counts?.notes ?? 0);
                  const classes = [
                    "day-cell",
                    "pressable",
                    inMonth ? "" : "outside",
                    dayKey === today ? "is-today" : "",
                    total ? "has-activity" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button
                      key={dayKey}
                      className={classes}
                      role="gridcell"
                      onClick={() => onSelectDay(dayKey)}
                      aria-current={dayKey === today ? "date" : undefined}
                      aria-label={`${formatDate(dayKey, { month: "long", day: "numeric" })}, ${total} ${
                        total === 1 ? "entry" : "entries"
                      }`}
                    >
                      {dayKey === selectedDay && (
                        <motion.span className="day-select-ring" layoutId="day-select-ring" transition={snappy} />
                      )}
                      <span className="day-number">{formatDate(dayKey, { day: "numeric" })}</span>
                      <span className="day-dots">
                        {Array.from({ length: Math.min(counts?.scheduled ?? 0, MAX_DOTS) }, (_, index) => (
                          <i key={`s${index}`} className="scheduled" />
                        ))}
                        {Array.from(
                          {
                            length: Math.min(
                              counts?.captured ?? 0,
                              Math.max(0, MAX_DOTS - (counts?.scheduled ?? 0)),
                            ),
                          },
                          (_, index) => (
                            <i key={`c${index}`} className="captured" />
                          ),
                        )}
                        {Array.from(
                          {
                            length: Math.min(
                              counts?.notes ?? 0,
                              Math.max(
                                0,
                                MAX_DOTS -
                                  (counts?.scheduled ?? 0) -
                                  (counts?.captured ?? 0),
                              ),
                            ),
                          },
                          (_, index) => (
                            <i key={`n${index}`} className="reading" />
                          ),
                        )}
                        {total > MAX_DOTS && <em>+</em>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="calendar-legend" aria-label="Calendar markers">
        <span><i className="scheduled" /> Scheduled</span>
        <span><i className="captured" /> Captured</span>
        <span><i className="reading" /> Reading</span>
      </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={selectedDay}
          className="day-panel card"
          aria-label={`Entries for ${selectedDay}`}
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={gentle}
        >
          <header>
            <h2>{dayTitle(selectedDay, today)}</h2>
            <span>
              {isRelative
                ? formatDate(selectedDay, { month: "long", day: "numeric", year: "numeric" })
                : formatDate(selectedDay, { year: "numeric" })}
            </span>
          </header>

          {dayScheduled.length === 0 && dayCaptured.length === 0 && readingCount === 0 ? (
            <QuietState compact icon={<TodayIcon size={17} />} title="A quiet day">
              Nothing was captured or scheduled here.
            </QuietState>
          ) : (
            <>
              {dayScheduled.length > 0 && (
                <div className="day-section">
                  <h3>
                    {dayScheduled.length} scheduled
                  </h3>
                  <ul className="thought-list">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {dayScheduled.map((thought) => (
                        <ThoughtRow
                          key={thought.id}
                          thought={thought}
                          today={today}
                          showQuadrant
                          onUpdate={onUpdate}
                          onDelete={onDelete}
                          deleting={deletingIds.has(thought.id)}
                          readOnly={readOnly}
                          onOpenDetail={onOpenDetail}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>
              )}

              {dayCaptured.length > 0 && (
                <div className="day-section">
                  <h3>{dayCaptured.length} captured</h3>
                  <ul className="thought-list">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {dayCaptured.map((thought) => (
                        <ThoughtRow
                          key={thought.id}
                          thought={thought}
                          today={today}
                          showQuadrant
                          onUpdate={onUpdate}
                          onDelete={onDelete}
                          deleting={deletingIds.has(thought.id)}
                          readOnly={readOnly}
                          onOpenDetail={onOpenDetail}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>
              )}

              {dayReading.map(({ book, rows }) => (
                <div key={book?.id ?? "unknown"} className="day-section">
                  <h3 className="from-book">
                    <em>From</em> {book?.title ?? "a book you removed"}
                  </h3>
                  <ul className="note-list">
                    {rows.map((note) => (
                      <li key={note.id}>
                        {note.page && <span className="note-page">p.{note.page}</span>}
                        <p>{note.body}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
