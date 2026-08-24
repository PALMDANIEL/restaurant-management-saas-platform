CREATE TYPE "public"."shift_group" AS ENUM('jour', 'soir');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "shift_group" "shift_group";--> statement-breakpoint
CREATE TABLE "venue_shift_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"day_start_time" varchar(5) DEFAULT '07:00' NOT NULL,
	"day_end_time" varchar(5) DEFAULT '19:00' NOT NULL,
	"night_start_time" varchar(5) DEFAULT '19:00' NOT NULL,
	"night_end_time" varchar(5) DEFAULT '06:00' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "venue_shift_settings_venue_id_unique" UNIQUE("venue_id")
);--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"shift_group" "shift_group" NOT NULL,
	"work_date" date NOT NULL,
	"clock_in" timestamp DEFAULT now() NOT NULL,
	"clock_out" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "venue_shift_settings" ADD CONSTRAINT "venue_shift_settings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_venue_idx" ON "attendance_records" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "attendance_user_idx" ON "attendance_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attendance_work_date_idx" ON "attendance_records" USING btree ("work_date");
