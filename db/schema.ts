import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const chapters = sqliteTable(
  "chapters",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    section: text("section").notNull().default("General"),
    summary: text("summary").notNull().default(""),
    content: text("content").notNull().default(""),
    keyTakeaways: text("key_takeaways").notNull().default(""),
    examTraps: text("exam_traps").notNull().default(""),
    recallQuestions: text("recall_questions").notNull().default(""),
    tags: text("tags").notNull().default(""),
    status: text("status").notNull().default("learning"),
    confidence: integer("confidence").notNull().default(1),
    reviewCount: integer("review_count").notNull().default(0),
    lastReviewed: text("last_reviewed"),
    nextReview: text("next_review").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_chapters_user_updated").on(table.userId, table.updatedAt),
    index("idx_chapters_user_review").on(table.userId, table.nextReview),
  ],
);

export const dailyNotes = sqliteTable(
  "daily_notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    noteDate: text("note_date").notNull(),
    focus: text("focus").notNull().default(""),
    learned: text("learned").notNull().default(""),
    takeaways: text("takeaways").notNull().default(""),
    questions: text("questions").notNull().default(""),
    tomorrow: text("tomorrow").notNull().default(""),
    tags: text("tags").notNull().default(""),
    minutes: integer("minutes").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_daily_notes_user_date_unique").on(table.userId, table.noteDate),
    index("idx_daily_notes_user_updated").on(table.userId, table.updatedAt),
  ],
);
