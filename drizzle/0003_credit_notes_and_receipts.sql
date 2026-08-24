CREATE TYPE "public"."credit_note_status" AS ENUM('active', 'used', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'credit_note';--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"customer_id" integer,
	"code" varchar(30) NOT NULL,
	"order_id" integer,
	"cash_session_id" integer,
	"amount" integer NOT NULL,
	"remaining_amount" integer NOT NULL,
	"reason" text,
	"status" "credit_note_status" DEFAULT 'active' NOT NULL,
	"issued_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"used_at" timestamp,
	CONSTRAINT "credit_notes_code_unique" UNIQUE("code")
);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "amount_received" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "change_given" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "credit_note_issued_id" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "credit_note_redeemed_id" integer;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_credit_note_issued_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_issued_id") REFERENCES "public"."credit_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_credit_note_redeemed_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_redeemed_id") REFERENCES "public"."credit_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_notes_venue_idx" ON "credit_notes" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "credit_notes_customer_idx" ON "credit_notes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "credit_notes_status_idx" ON "credit_notes" USING btree ("status");
