ALTER TABLE `thoughts` ADD `scheduled_day_key` text;--> statement-breakpoint
CREATE INDEX `idx_thoughts_user_scheduled` ON `thoughts` (`user_id`,`scheduled_day_key`);