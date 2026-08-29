"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { daysBetween } from "@/lib/date-keys";
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

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function Briefing({ thoughts, books, notes, today, onOpenDetail }: Props) {
  const reduceMotion = useReducedMotion();
  const { headline, alert, chips } = useMemo(() => {
    const open = thoughts.filter((thought) => !thought.done);
    const capturedToday =
      thoughts.filter((thought) => thought.dayKey === today).length +
      notes.filter((note) => note.dayKey === today).length;

    const oldestUrgent = open
      .filter((thought) => thought.quadrant === "do")
      .reduce<Thought | null>(
        (oldest, thought) => (!oldest || thought.dayKey < oldest.dayKey ? thought : oldest),
        null,
      );
    const urgentAge = oldestUrgent ? daysBetween(oldestUrgent.dayKey, today) : 0;

    const reading = books.filter((book) => !book.finishedAt);
    const latestNote = [...notes]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((note) => reading.some((book) => book.id === note.bookId));
    const currentBook = reading.find((book) => book.id === latestNote?.bookId) ?? reading[0];

    let headline: React.ReactNode;
    let alert = false;
    if (oldestUrgent && urgentAge >= 2) {
      headline = (
        <>
          An urgent item has waited <strong>{urgentAge} days</strong>.{" "}
          <button
            className="briefing-task-link"
            type="button"
            role="link"
            onClick={() => onOpenDetail(oldestUrgent.id)}
            aria-label={`Open task details for ${oldestUrgent.body}`}
          >
            {oldestUrgent.body}
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

    if (urgentAge >= 2) {
      chips.push({
        key: "urgent",
        tone: "b-red",
        icon: <FlameIcon size={13} />,
        text: (
          <>
            urgent for <strong>{urgentAge} days</strong>
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

  return (
    <motion.section
      className="briefing"
      aria-label="Daily briefing"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } } }}
    >
      <motion.img
        className="orb"
        src={reduceMotion ? "/animated.svg" : "/hero_img.svg"}
        alt=""
        aria-hidden="true"
        variants={{ hidden: { opacity: 0, scale: 0.4 }, show: { opacity: 1, scale: 1 } }}
        transition={gentle}
      />
      <motion.h1
        className="briefing-greeting"
        variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
        transition={gentle}
      >
        {greeting()}.
      </motion.h1>
      <motion.p
        className={`briefing-sub ${alert ? "alert" : ""}`}
        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
        transition={gentle}
      >
        {headline}
      </motion.p>
      <motion.div
        className="briefing-chips"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      >
        {chips.map((chip) => (
          <motion.span
            key={chip.key}
            className={`b-chip ${chip.tone}`}
            variants={{ hidden: { opacity: 0, y: 10, scale: 0.94 }, show: { opacity: 1, y: 0, scale: 1 } }}
            transition={gentle}
          >
            <i aria-hidden="true">{chip.icon}</i>
            <span>{chip.text}</span>
          </motion.span>
        ))}
      </motion.div>
    </motion.section>
  );
}
