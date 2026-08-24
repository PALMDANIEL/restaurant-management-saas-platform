CREATE TYPE "public"."license_status" AS ENUM('active', 'suspended', 'expired');--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "license_status" "license_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "license_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "max_users" integer;