CREATE TABLE "staff_behavior_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"work_date" date NOT NULL,
	"courtesy" integer NOT NULL,
	"appearance" integer NOT NULL,
	"teamwork" integer NOT NULL,
	"rigor" integer NOT NULL,
	"responsiveness" integer NOT NULL,
	"comment" text,
	"rated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "corrected_by" integer;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "correction_note" text;--> statement-breakpoint
ALTER TABLE "staff_behavior_ratings" ADD CONSTRAINT "staff_behavior_ratings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_behavior_ratings" ADD CONSTRAINT "staff_behavior_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_behavior_ratings" ADD CONSTRAINT "staff_behavior_ratings_rated_by_users_id_fk" FOREIGN KEY ("rated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_behavior_user_day_idx" ON "staff_behavior_ratings" USING btree ("venue_id","user_id","work_date");--> statement-breakpoint
CREATE INDEX "staff_behavior_work_date_idx" ON "staff_behavior_ratings" USING btree ("work_date");--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;