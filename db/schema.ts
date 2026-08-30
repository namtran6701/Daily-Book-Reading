import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const thoughts = sqliteTable(
  "thoughts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    body: text("body").notNull(),
    notes: text("notes").notNull().default(""),
    quadrant: text("quadrant").notNull().default("later"),
    status: text("status").notNull().default("open"),
    capturedDayKey: text("day_key").notNull(),
    scheduledDayKey: text("scheduled_day_key"),
    doneAt: text("done_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_thoughts_user_day").on(table.userId, table.capturedDayKey),
    index("idx_thoughts_user_scheduled").on(table.userId, table.scheduledDayKey),
    index("idx_thoughts_user_quadrant").on(table.userId, table.quadrant, table.status),
  ],
);

export const books = sqliteTable(
  "books",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    finishedAt: text("finished_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_books_user_created").on(table.userId, table.createdAt)],
);

export const bookNotes = sqliteTable(
  "book_notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    bookId: text("book_id").notNull(),
    body: text("body").notNull(),
    notes: text("notes").notNull().default(""),
    page: text("page").notNull().default(""),
    pageEnd: text("page_end").notNull().default(""),
    dayKey: text("day_key").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_book_notes_user_book").on(table.userId, table.bookId, table.createdAt),
    index("idx_book_notes_user_day").on(table.userId, table.dayKey),
  ],
);
