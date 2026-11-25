"use client";

import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { WifiOff, RefreshCw } from "lucide-react";
import {
  getQueuedOrders,
  removeQueuedOrder,
  getQueuedRequests,
  removeQueuedRequest,
  countQueuedOrders,
  QUEUE_EVENT,
} from "@/lib/offline-queue";
import { installOfflineFetch, QUEUED_AT_HEADER } from "@/lib/offline-fetch";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

type Job = { kind: "order" | "request"; id: string; createdAt: number; summary: string; send: () => Promise<Response> };

export function OfflineSyncManager() {
  // Lu depuis le navigateur après l'hydratation : le rendu serveur suppose « en ligne »,
  // sans quoi la bannière hors ligne faisait échouer l'hydratation de toute l'application.
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await countQueuedOrders());
  }, []);

  const flushQueue = useCallback(async () => {
    if (syncingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const [orders, requests] = await Promise.all([getQueuedOrders(), getQueuedRequests()]);
    if (orders.length + requests.length === 0) return;

    // Tout est rejoué dans l'ordre où les choses se sont passées, avec l'heure d'origine.
    const jobs: Job[] = [
      ...orders.map<Job>((o) => ({
        kind: "order",
        id: o.id,
        createdAt: o.createdAt,
        summary: o.summary,
        send: () =>
          fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json", [QUEUED_AT_HEADER]: String(o.createdAt) },
            body: JSON.stringify(o.payload),
          }),
      })),
      ...requests.map<Job>((r) => ({
        kind: "request",
        id: r.id,
        createdAt: r.createdAt,
        summary: r.summary,
        send: () =>
          fetch(r.url, {
            method: r.method,
            headers: { "Content-Type": "application/json", [QUEUED_AT_HEADER]: String(r.createdAt) },
            body: r.body,
          }),
      })),
    ].sort((a, b) => a.createdAt - b.createdAt);

    syncingRef.current = true;
    setSyncing(true);
    let successCount = 0;
    const rejected: string[] = [];
    let sessionExpired = false;

    for (const job of jobs) {
      try {
        const res = await job.send();
        if (res.status === 401) {
          // Session terminée pendant l'absence de réseau : on garde tout, rien n'est perdu.
          sessionExpired = true;
          break;
        }
        if (res.status >= 500) break; // serveur en difficulté : on réessaiera plus tard
        if (res.ok) successCount++;
        else rejected.push(job.summary); // refusé par le serveur : inutile de réessayer indéfiniment
        if (job.kind === "order") await removeQueuedOrder(job.id);
        else await removeQueuedRequest(job.id);
      } catch {
        // Réseau perdu de nouveau en cours d'envoi : on s'arrête, le reste attend.
        break;
      }
    }

    syncingRef.current = false;
    setSyncing(false);
    await refreshPendingCount();
    queryClient.invalidateQueries();

    if (successCount > 0) {
      toast.success(
        `${successCount} opération${successCount > 1 ? "s" : ""} enregistrée${successCount > 1 ? "s" : ""} après reconnexion`
      );
    }
    if (rejected.length > 0) {
      toast.error(
        `${rejected.length} opération${rejected.length > 1 ? "s" : ""} refusée${rejected.length > 1 ? "s" : ""} par le serveur (${[
          ...new Set(rejected),
        ].join(", ")}) — à refaire manuellement`
      );
    }
    if (sessionExpired) {
      toast.warning("Reconnectez-vous : les opérations en attente sont gardées et partiront ensuite.");
    }
  }, [queryClient, refreshPendingCount]);

  useEffect(() => {
    installOfflineFetch();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async IndexedDB read on mount, not synchronous setState
    refreshPendingCount();

    function handleOnline() {
      flushQueue();
    }
    function handleChange() {
      refreshPendingCount();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener(QUEUE_EVENT, handleChange);

    // Safety net: some flaky connections report navigator.onLine === true while requests
    // still fail. Retry periodically regardless, it's a no-op when the queue is empty.
    flushQueue();
    const interval = setInterval(() => {
      refreshPendingCount();
      if (navigator.onLine) flushQueue();
    }, 20_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(QUEUE_EVENT, handleChange);
      clearInterval(interval);
    };
  }, [flushQueue, refreshPendingCount]);

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 px-4 py-2 text-center text-xs font-medium text-white ${
        isOnline ? "bg-sky-600" : "bg-amber-600"
      }`}
    >
      {isOnline ? (
        <>
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Envoi des opérations en attente..." : `${pendingCount} opération(s) en attente d'envoi`}
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          Hors ligne — ventes, pointages, dépenses et encaissements sont gardés sur l&apos;appareil
          {pendingCount > 0 ? ` (${pendingCount} en attente)` : ""}
        </>
      )}
    </div>
  );
}
