import type { Quadrant } from "./quadrants";

export type Thought = {
  id: string;
  body: string;
  notes: string;
  quadrant: Quadrant;
  done: boolean;
  capturedDayKey: string;
  scheduledDayKey: string | null;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Book = {
  id: string;
  title: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookNote = {
  id: string;
  bookId: string;
  body: string;
  notes: string;
  page: string;
  pageEnd: string;
  dayKey: string;
  createdAt: string;
  updatedAt: string;
};
