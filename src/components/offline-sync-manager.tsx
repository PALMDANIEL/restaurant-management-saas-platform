"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { WifiOff, RefreshCw } from "lucide-react";
import { getQueuedOrders, removeQueuedOrder, countQueuedOrders } from "@/lib/offline-queue";

export function OfflineSyncManager() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
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

    const queued = await getQueuedOrders();
    if (queued.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of queued.sort((a, b) => a.createdAt - b.createdAt)) {
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          await removeQueuedOrder(item.id);
          successCount++;
        } else {
          // Server responded but rejected the order (e.g. stock changed meanwhile) — drop it
          // rather than retrying forever, and let the user know so they can re-enter it manually.
          await removeQueuedOrder(item.id);
          failCount++;
        }
      } catch {
        // Still offline / network dropped again mid-sync — stop here, the rest stays queued.
        break;
      }
    }

    syncingRef.current = false;
    setSyncing(false);
    await refreshPendingCount();
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });

    if (successCount > 0) {
      toast.success(
        `${successCount} vente${successCount > 1 ? "s" : ""} enregistrée${successCount > 1 ? "s" : ""} après reconnexion`
      );
    }
    if (failCount > 0) {
      toast.error(
        `${failCount} vente${failCount > 1 ? "s" : ""} en attente n'${failCount > 1 ? "ont" : "a"} pas pu être envoyée${
          failCount > 1 ? "s" : ""
        } — à ressaisir manuellement`
      );
    }
  }, [queryClient, refreshPendingCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async IndexedDB read on mount, not synchronous setState
    refreshPendingCount();

    function handleOnline() {
      setIsOnline(true);
      flushQueue();
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Safety net: some flaky connections report navigator.onLine === true while requests
    // still fail. Retry periodically regardless, it's a no-op when the queue is empty.
    const interval = setInterval(() => {
      refreshPendingCount();
      if (navigator.onLine) flushQueue();
    }, 20_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
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
          {syncing ? "Envoi des ventes en attente..." : `${pendingCount} vente(s) en attente d'envoi`}
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          Hors ligne — les ventes du Point de vente sont enregistrées localement
          {pendingCount > 0 ? ` (${pendingCount} en attente)` : ""}
        </>
      )}
    </div>
  );
}
