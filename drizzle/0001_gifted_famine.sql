CREATE TABLE `daily_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`note_date` text NOT NULL,
	`focus` text DEFAULT '' NOT NULL,
	`learned` text DEFAULT '' NOT NULL,
	`takeaways` text DEFAULT '' NOT NULL,
	`questions` text DEFAULT '' NOT NULL,
	`tomorrow` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '' NOT NULL,
	`minutes` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_notes_user_date_unique` ON `daily_notes` (`user_id`,`note_date`);--> statement-breakpoint
CREATE INDEX `idx_daily_notes_user_updated` ON `daily_notes` (`user_id`,`updated_at`);