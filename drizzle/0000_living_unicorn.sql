CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`section` text DEFAULT 'General' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`key_takeaways` text DEFAULT '' NOT NULL,
	`exam_traps` text DEFAULT '' NOT NULL,
	`recall_questions` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'learning' NOT NULL,
	`confidence` integer DEFAULT 1 NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`last_reviewed` text,
	`next_review` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chapters_user_updated` ON `chapters` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_chapters_user_review` ON `chapters` (`user_id`,`next_review`);