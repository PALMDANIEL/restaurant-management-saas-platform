import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const isNeon = databaseUrl.includes("neon.tech");

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

/** Only set for standard TCP Postgres connections — null when using Neon's HTTP driver (nothing to close). */
export const pool: Pool | null = isNeon
  ? null
  : globalForDb.__arenaNextJsPostgresqlPool ??
    (() => {
      const p = new Pool({ connectionString: databaseUrl });
      if (process.env.NODE_ENV !== "production") {
        globalForDb.__arenaNextJsPostgresqlPool = p;
      }
      return p;
    })();

/**
 * Neon databases are reached over HTTPS (port 443) via @neondatabase/serverless.
 * This avoids relying on raw TCP port 5432, which some networks/ISPs block outbound
 * while leaving standard web ports open. Any other Postgres (e.g. local dev) keeps
 * using the standard node-postgres TCP driver.
 */
export const db = isNeon ? drizzleNeon(neon(databaseUrl)) : drizzlePg(pool!);
