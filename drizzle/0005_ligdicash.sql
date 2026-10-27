CREATE TYPE "public"."ligdicash_invoice_status" AS ENUM('pending', 'paid', 'failed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'ligdicash';--> statement-breakpoint
CREATE TABLE "ligdicash_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"venue_id" integer NOT NULL,
	"cash_session_id" integer,
	"amount" integer NOT NULL,
	"credit_note_code" varchar(20),
	"token" text,
	"payment_url" text,
	"status" "ligdicash_invoice_status" DEFAULT 'pending' NOT NULL,
	"operator" varchar(60),
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	CONSTRAINT "ligdicash_invoices_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "ligdicash_api_key" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "ligdicash_auth_token" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "ligdicash_live" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ligdicash_invoices" ADD CONSTRAINT "ligdicash_invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligdicash_invoices" ADD CONSTRAINT "ligdicash_invoices_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligdicash_invoices" ADD CONSTRAINT "ligdicash_invoices_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligdicash_invoices" ADD CONSTRAINT "ligdicash_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ligdicash_invoices_order_idx" ON "ligdicash_invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ligdicash_invoices_venue_idx" ON "ligdicash_invoices" USING btree ("venue_id");