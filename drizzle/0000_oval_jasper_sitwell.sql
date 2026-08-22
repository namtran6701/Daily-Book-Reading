CREATE TABLE `book_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`body` text NOT NULL,
	`page` text DEFAULT '' NOT NULL,
	`day_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_book_notes_user_book` ON `book_notes` (`user_id`,`book_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_book_notes_user_day` ON `book_notes` (`user_id`,`day_key`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_books_user_created` ON `books` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `thoughts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`quadrant` text DEFAULT 'later' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`day_key` text NOT NULL,
	`done_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_thoughts_user_day` ON `thoughts` (`user_id`,`day_key`);--> statement-breakpoint
CREATE INDEX `idx_thoughts_user_quadrant` ON `thoughts` (`user_id`,`quadrant`,`status`);