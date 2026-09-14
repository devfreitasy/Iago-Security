CREATE TABLE `workspace_state` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_state_owner_id` ON `workspace_state` (`owner_id`);
--> statement-breakpoint
PRAGMA optimize;
