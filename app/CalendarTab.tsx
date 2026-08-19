"use client";

import { useMemo } from "react";
import { ThoughtRow } from "./ThoughtRow";
import { WEEKDAY_INITIALS, dayTitle, formatDate, monthGrid, monthLabel } from "./date-keys";
import { TodayIcon } from "./icons";
import type { Book, BookNote, Thought } from "./types";

type Props = {
  thoughts: Thought[];
  notes: BookNote[];
  books: Book[];
  today: string;
  month: string;
  selectedDay: string;
  onMonthChange: (direction: "previous" | "next") => void;
  onSelectDay: (day: string) => void;
  onUpdate: (id: string, patch: Partial<Thought>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
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
}: Props) {
  const activity = useMemo(() => {
    const map = new Map<string, { thoughts: number; notes: number }>();
    const bump = (day: string, field: "thoughts" | "notes") => {
      const entry = map.get(day) ?? { thoughts: 0, notes: 0 };
      entry[field] += 1;
      map.set(day, entry);
    };
    for (const thought of thoughts) bump(thought.dayKey, "thoughts");
    for (const note of notes) bump(note.dayKey, "notes");
    return map;
  }, [thoughts, notes]);

  const cells = useMemo(() => monthGrid(month), [month]);

  const dayThoughts = useMemo(
    () =>
      thoughts
        .filter((thought) => thought.dayKey === selectedDay)
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

  return (
    <>
      <header className="month-header">
        <h2>{monthLabel(month)}</h2>
        <div className="month-nav">
          <button
            className="icon-button"
            onClick={() => onMonthChange("previous")}
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            className="icon-button"
            onClick={() => onSelectDay(today)}
            aria-label="Today"
            title="Today"
          >
            <TodayIcon />
          </button>
          <button className="icon-button" onClick={() => onMonthChange("next")} aria-label="Next month">
            ›
          </button>
        </div>
      </header>

      <div className="calendar" role="grid" aria-label={`${monthLabel(month)} calendar`}>
        <div className="weekday-row" role="row">
          {WEEKDAY_INITIALS.map((initial, index) => (
            <span key={index} role="columnheader">
              {initial}
            </span>
          ))}
        </div>
        <div className="day-grid">
          {cells.map(({ dayKey, inMonth }) => {
            const counts = activity.get(dayKey);
            const total = (counts?.thoughts ?? 0) + (counts?.notes ?? 0);
            const classes = [
              "day-cell",
              inMonth ? "" : "outside",
              dayKey === today ? "is-today" : "",
              dayKey === selectedDay ? "is-selected" : "",
              total ? "has-activity" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={dayKey}
                className={classes}
                onClick={() => onSelectDay(dayKey)}
                aria-current={dayKey === today ? "date" : undefined}
                aria-label={`${formatDate(dayKey, { month: "long", day: "numeric" })}, ${total} ${
                  total === 1 ? "entry" : "entries"
                }`}
              >
                <span className="day-number">{formatDate(dayKey, { day: "numeric" })}</span>
                <span className="day-dots">
                  {Array.from({ length: Math.min(counts?.thoughts ?? 0, MAX_DOTS) }, (_, index) => (
                    <i key={`t${index}`} />
                  ))}
                  {Array.from(
                    { length: Math.min(counts?.notes ?? 0, Math.max(0, MAX_DOTS - (counts?.thoughts ?? 0))) },
                    (_, index) => (
                      <i key={`n${index}`} className="hollow" />
                    ),
                  )}
                  {total > MAX_DOTS && <em>+</em>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="day-panel" aria-label={`Entries for ${selectedDay}`}>
        <header>
          <h2>{dayTitle(selectedDay, today)}</h2>
          <span>
            {isRelative
              ? formatDate(selectedDay, { month: "long", day: "numeric", year: "numeric" })
              : formatDate(selectedDay, { year: "numeric" })}
          </span>
        </header>

        {dayThoughts.length === 0 && readingCount === 0 ? (
          <p className="empty-line">Nothing written on this day.</p>
        ) : (
          <>
            {dayThoughts.length > 0 && (
              <div className="day-section">
                <h3>
                  {dayThoughts.length} {dayThoughts.length === 1 ? "thought" : "thoughts"}
                </h3>
                <ul className="thought-list">
                  {dayThoughts.map((thought) => (
                    <ThoughtRow
                      key={thought.id}
                      thought={thought}
                      today={today}
                      showQuadrant
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                    />
                  ))}
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
      </section>
    </>
  );
}
