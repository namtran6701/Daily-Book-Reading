CREATE TABLE `notification_log` (
	`subscription_id` text NOT NULL,
	`kind` text NOT NULL,
	`local_day_key` text NOT NULL,
	`sent_at` text NOT NULL,
	PRIMARY KEY(`subscription_id`, `kind`, `local_day_key`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`time_zone` text NOT NULL,
	`notify_minute` integer DEFAULT 450 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_user` ON `push_subscriptions` (`user_id`);