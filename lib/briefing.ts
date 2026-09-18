import { daysBetween } from "./date-keys";

// The fields the briefing reads. A D1 row and a client `Thought` both fit.
export type BriefingThought = {
  id: string;
  body: string;
  quadrant: string;
  done: boolean;
  capturedDayKey: string;
  scheduledDayKey: string | null;
};

export type UrgentItem<T> = { thought: T; age: number; overdue: boolean };

export type ThoughtSummary<T> = {
  open: T[];
  // The oldest Do-quadrant item, present only once it has waited long enough
  // to deserve the headline: a day past its date, or two days since capture.
  urgent: UrgentItem<T> | null;
};

// Shared by the Calendar briefing and the morning push, so both say the same
// thing about the same data.
export function summarizeThoughts<T extends BriefingThought>(thoughts: T[], today: string): ThoughtSummary<T> {
  const open = thoughts.filter((thought) => !thought.done);
  const urgent = open.filter((thought) => thought.quadrant === "do");
  const overdue = urgent
    .filter((thought) => thought.scheduledDayKey && thought.scheduledDayKey < today)
    .sort((a, b) => a.scheduledDayKey!.localeCompare(b.scheduledDayKey!));
  const oldest =
    overdue[0] ?? [...urgent].sort((a, b) => a.capturedDayKey.localeCompare(b.capturedDayKey))[0] ?? null;
  if (!oldest) return { open, urgent: null };
  const isOverdue = Boolean(oldest.scheduledDayKey && oldest.scheduledDayKey < today);
  const age = daysBetween(isOverdue ? oldest.scheduledDayKey! : oldest.capturedDayKey, today);
  const needsAttention = age >= (isOverdue ? 1 : 2);
  return { open, urgent: needsAttention ? { thought: oldest, age, overdue: isOverdue } : null };
}

export function greeting(hour: number): string {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const MAX_BODY_PREVIEW = 120;

// The notification mirrors the briefing headline. Nothing open means nothing
// worth a buzz, so it returns null and the caller sends nothing.
export function briefingNotification(
  summary: ThoughtSummary<BriefingThought>,
  hour: number,
): { title: string; body: string } | null {
  const title = `${greeting(hour)}.`;
  if (summary.urgent) {
    const { thought, age, overdue } = summary.urgent;
    const days = `${age} ${age === 1 ? "day" : "days"}`;
    const preview =
      thought.body.length > MAX_BODY_PREVIEW ? `${thought.body.slice(0, MAX_BODY_PREVIEW - 1)}…` : thought.body;
    return { title, body: `An urgent item ${overdue ? `is ${days} overdue` : `has waited ${days}`}: ${preview}` };
  }
  const count = summary.open.length;
  if (!count) return null;
  return { title, body: `${count} open ${count === 1 ? "thought" : "thoughts"}. Your plate is under control.` };
}
