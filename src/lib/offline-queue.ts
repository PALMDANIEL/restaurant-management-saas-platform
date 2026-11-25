import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "dani-mak-offline";
const DB_VERSION = 2;
const STORE = "pending-orders";
const STORE_REQUESTS = "pending-requests";

export type QueuedOrder = {
  id: string;
  payload: Record<string, unknown>;
  createdAt: number;
  /** Human-readable summary shown in the pending-sync UI (e.g. "Table 4 — 3 500 FCFA"). */
  summary: string;
};

/** Toute autre écriture faite sans réseau (dépense, pointage, encaissement…), rejouée telle quelle au retour de la connexion. */
export type QueuedRequest = {
  id: string;
  method: string;
  url: string;
  body: string | null;
  createdAt: number;
  summary: string;
};

/** Signale à l'écran (bannière, compteur) que la file a changé. */
export const QUEUE_EVENT = "dani-mak-queue-changed";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof window === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_REQUESTS)) {
          db.createObjectStore(STORE_REQUESTS, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

function notifyChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_EVENT));
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function queueOrder(payload: Record<string, unknown>, summary: string): Promise<QueuedOrder> {
  const db = await getDb();
  const entry: QueuedOrder = { id: newId(), payload, createdAt: Date.now(), summary };
  if (db) await db.put(STORE, entry);
  notifyChange();
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
  notifyChange();
}

export async function queueRequest(method: string, url: string, body: string | null, summary: string): Promise<QueuedRequest> {
  const db = await getDb();
  const entry: QueuedRequest = { id: newId(), method, url, body, createdAt: Date.now(), summary };
  if (db) await db.put(STORE_REQUESTS, entry);
  notifyChange();
  return entry;
}

export async function getQueuedRequests(): Promise<QueuedRequest[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAll(STORE_REQUESTS);
}

export async function removeQueuedRequest(id: string) {
  const db = await getDb();
  if (db) await db.delete(STORE_REQUESTS, id);
  notifyChange();
}

/** Nombre total d'opérations en attente (ventes + autres écritures). */
export async function countQueuedOrders(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  return (await db.count(STORE)) + (await db.count(STORE_REQUESTS));
}

/**
 * A fetch failure caused by no network (offline, DNS/connection error) vs a normal
 * HTTP error response (4xx/5xx, which the server did answer and should NOT be queued/retried blindly).
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return error instanceof TypeError;
}
