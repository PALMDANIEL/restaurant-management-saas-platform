CREATE TABLE "shift_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"name" varchar(40) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_plan_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"shift" "shift_group" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rest_day" smallint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rotation_group_id" integer;--> statement-breakpoint
ALTER TABLE "shift_groups" ADD CONSTRAINT "shift_groups_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plan_blocks" ADD CONSTRAINT "shift_plan_blocks_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plan_blocks" ADD CONSTRAINT "shift_plan_blocks_group_id_shift_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."shift_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_groups_venue_idx" ON "shift_groups" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "shift_plan_venue_idx" ON "shift_plan_blocks" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "shift_plan_dates_idx" ON "shift_plan_blocks" USING btree ("start_date","end_date");