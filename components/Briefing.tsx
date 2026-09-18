"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { greeting, summarizeThoughts } from "@/lib/briefing";
import { formatDate } from "@/lib/date-keys";
import { BookGlyph, FlameIcon, MatrixGlyph, PlusIcon } from "./icons";
import { gentle } from "@/lib/springs";
import type { Book, BookNote, Thought } from "@/lib/types";

type Props = {
  thoughts: Thought[];
  books: Book[];
  notes: BookNote[];
  today: string;
  onOpenDetail: (id: string) => void;
};

type Chip = { key: string; tone: string; icon: React.ReactNode; text: React.ReactNode };

export function Briefing({ thoughts, books, notes, today, onOpenDetail }: Props) {
  const { headline, alert, chips } = useMemo(() => {
    const { open, urgent } = summarizeThoughts(thoughts, today);
    const capturedToday =
      thoughts.filter((thought) => thought.capturedDayKey === today).length +
      notes.filter((note) => note.dayKey === today).length;

    const reading = books.filter((book) => !book.finishedAt);
    const latestNote = [...notes]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((note) => reading.some((book) => book.id === note.bookId));
    const currentBook = reading.find((book) => book.id === latestNote?.bookId) ?? reading[0];

    let headline: React.ReactNode;
    let alert = false;
    if (urgent) {
      const { thought, age, overdue } = urgent;
      headline = (
        <>
          An urgent item {overdue ? "is" : "has waited"}{" "}
          <strong>
            {age} {age === 1 ? "day" : "days"}{overdue ? " overdue" : ""}
          </strong>.{" "}
          <button
            className="briefing-task-link"
            type="button"
            role="link"
            onClick={() => onOpenDetail(thought.id)}
            aria-label={`Open task details for ${thought.body}`}
          >
            {thought.body}
          </button>
        </>
      );
      alert = true;
    } else if (open.length === 0) {
      headline = <>Your mind is clear. Nothing left open.</>;
    } else if (capturedToday === 0) {
      headline = <>Nothing captured yet today. What&rsquo;s on your mind?</>;
    } else {
      headline = <>Keep it coming. Your plate is under control.</>;
    }

    const chips: Chip[] = [
      {
        key: "open",
        tone: "b-blue",
        icon: <MatrixGlyph size={13} />,
        text: (
          <>
            <strong>{open.length}</strong> open {open.length === 1 ? "thought" : "thoughts"}
          </>
        ),
      },
      {
        key: "captured",
        tone: "b-green",
        icon: <PlusIcon size={13} />,
        text: (
          <>
            <strong>{capturedToday}</strong> captured today
          </>
        ),
      },
    ];

    if (urgent) {
      chips.push({
        key: "urgent",
        tone: "b-red",
        icon: <FlameIcon size={13} />,
        text: (
          <>
            {urgent.overdue ? "overdue by" : "urgent for"}{" "}
            <strong>{urgent.age} {urgent.age === 1 ? "day" : "days"}</strong>
          </>
        ),
      });
    }

    if (currentBook) {
      const noteCount = notes.filter((note) => note.bookId === currentBook.id).length;
      chips.push({
        key: "book",
        tone: "b-gray",
        icon: <BookGlyph size={13} />,
        text: (
          <>
            <strong>{currentBook.title}</strong>
            {noteCount > 0 && <> · {noteCount} {noteCount === 1 ? "note" : "notes"}</>}
          </>
        ),
      });
    }

    return { headline, alert, chips };
  }, [thoughts, books, notes, today, onOpenDetail]);

  const rise = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.section
      className="briefing"
      aria-label="Daily briefing"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
    >
      <div className="dateline">
        <motion.span
          className="dateline-day"
          aria-hidden="true"
          variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
          transition={gentle}
        >
          {formatDate(today, { day: "numeric" })}
        </motion.span>
        <div className="dateline-copy">
          <motion.span className="eyebrow dateline-when" variants={rise} transition={gentle}>
            {formatDate(today, { weekday: "long" })} · {formatDate(today, { month: "long", year: "numeric" })}
          </motion.span>
          <motion.h1 className="briefing-greeting" variants={rise} transition={gentle}>
            {greeting(new Date().getHours())}.
          </motion.h1>
          <motion.p className={`briefing-sub ${alert ? "alert" : ""}`} variants={rise} transition={gentle}>
            {headline}
          </motion.p>
        </div>
      </div>
      <motion.ul
        className="briefing-stats"
        aria-label="Today at a glance"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      >
        {chips.map((chip) => (
          <motion.li key={chip.key} className={`b-stat ${chip.tone}`} variants={rise} transition={gentle}>
            <i aria-hidden="true">{chip.icon}</i>
            <span>{chip.text}</span>
          </motion.li>
        ))}
      </motion.ul>
    </motion.section>
  );
}
