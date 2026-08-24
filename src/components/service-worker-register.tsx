"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silently ignore — the app works fully without the service worker,
        // it only adds installability + a thin offline fallback for the app shell.
      });
    }
  }, []);

  return null;
}
