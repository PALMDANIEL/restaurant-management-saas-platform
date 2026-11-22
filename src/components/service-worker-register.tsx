"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
          // Une fois en ligne, garder sur l'appareil les pages de travail pour
          // pouvoir les rouvrir sans connexion.
          if (!navigator.onLine) return;
          for (const path of ["/pos", "/dashboard", "/api/auth/me"]) {
            fetch(path, { credentials: "same-origin" }).catch(() => {});
          }
        })
        .catch(() => {
          // Le service worker est un plus : l'application marche sans lui.
        });
    }
  }, []);

  return null;
}
