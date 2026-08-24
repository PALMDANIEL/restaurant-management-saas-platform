import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "dani-mak-offline";
const DB_VERSION = 1;
const STORE = "pending-orders";

export type QueuedOrder = {
  id: string;
  payload: Record<string, unknown>;
  createdAt: number;
  /** Human-readable summary shown in the pending-sync UI (e.g. "Table 4 — 3 500 FCFA"). */
  summary: string;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof window === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function queueOrder(payload: Record<string, unknown>, summary: string): Promise<QueuedOrder> {
  const db = await getDb();
  const entry: QueuedOrder = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    payload,
    createdAt: Date.now(),
    summary,
  };
  if (db) await db.put(STORE, entry);
  return entry;
}

export async function getQueuedOrders(): Promise<QueuedOrder[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAll(STORE);
}

export async function removeQueuedOrder(id: string) {
  const db = await getDb();
  if (db) await db.delete(STORE, id);
}

export async function countQueuedOrders(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  return db.count(STORE);
}

/**
 * A fetch failure caused by no network (offline, DNS/connection error) vs a normal
 * HTTP error response (4xx/5xx, which the server did answer and should NOT be queued/retried blindly).
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return error instanceof TypeError;
}
