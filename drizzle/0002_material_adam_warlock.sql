CREATE TABLE "rate_limit_bucket" (
	"id" text PRIMARY KEY NOT NULL,
	"window_start" timestamp NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
