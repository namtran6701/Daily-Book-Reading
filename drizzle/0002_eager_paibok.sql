CREATE TABLE `thoughts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`tags` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`day_key` text NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`done_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_thoughts_user_day` ON `thoughts` (`user_id`,`day_key`);--> statement-breakpoint
CREATE INDEX `idx_thoughts_user_status_day` ON `thoughts` (`user_id`,`status`,`day_key`);