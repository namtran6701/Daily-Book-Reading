import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
