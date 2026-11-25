"use client";

import { toast } from "sonner";
import { isNetworkError, queueRequest } from "./offline-queue";

/**
 * Écritures qui peuvent attendre le retour du réseau : elles sont gardées sur l'appareil puis
 * rejouées dans l'ordre, avec leur heure d'origine (en-tête QUEUED_AT_HEADER).
 * Exclus : connexion, administration, paiement en ligne, réglages de l'entreprise, comptes,
 * fichiers envoyés, et la création d'une vente (qui a sa propre file, voir offline-queue).
 */
const RULES: { prefix: string; label: string; skip?: (method: string) => boolean }[] = [
  { prefix: "/api/expenses", label: "Dépense" },
  { prefix: "/api/attendance", label: "Pointage" },
  { prefix: "/api/cash-sessions", label: "Caisse" },
  { prefix: "/api/customers", label: "Client" },
  { prefix: "/api/reservations", label: "Réservation" },
  { prefix: "/api/stock", label: "Stock" },
  { prefix: "/api/credit-notes", label: "Avoir" },
  { prefix: "/api/staff-ratings", label: "Note de comportement" },
  { prefix: "/api/orders", label: "Commande", skip: (m) => m === "POST" },
];

const WRITE_METHODS = ["POST", "PATCH", "PUT", "DELETE"];

/** En-tête posé quand une opération gardée est rejouée : le serveur y lit l'heure à laquelle elle a vraiment eu lieu. */
export const QUEUED_AT_HEADER = "x-queued-at";

function describe(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof input !== "string" && !(input instanceof URL)) return null;
  const method = (init?.method ?? "GET").toUpperCase();
  if (!WRITE_METHODS.includes(method)) return null;
  if (typeof init?.body !== "string" && init?.body != null) return null; // fichiers : jamais gardés
  let url: URL;
  try {
    url = new URL(input.toString(), window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  const rule = RULES.find((r) => url.pathname === r.prefix || url.pathname.startsWith(r.prefix + "/"));
  if (!rule || rule.skip?.(method)) return null;
  return { method, path: url.pathname + url.search, label: rule.label, body: (init?.body as string | undefined) ?? null };
}

function hasQueuedAt(init?: RequestInit) {
  const h = init?.headers;
  if (!h) return false;
  if (h instanceof Headers) return h.has(QUEUED_AT_HEADER);
  if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === QUEUED_AT_HEADER);
  return Object.keys(h).some((k) => k.toLowerCase() === QUEUED_AT_HEADER);
}

/**
 * Remplace fetch par une version qui, sans réseau, garde les écritures ci-dessus sur le téléphone
 * et répond « enregistré (202) » : l'écran continue, et tout part au retour de la connexion.
 */
export function installOfflineFetch() {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { __offlineFetchInstalled?: boolean };
  if (w.__offlineFetchInstalled) return;
  w.__offlineFetchInstalled = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = describe(input, init);
    if (!target || hasQueuedAt(init)) return original(input, init);
    try {
      return await original(input, init);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      await queueRequest(target.method, target.path, target.body, target.label);
      toast.warning("Hors ligne — enregistré sur l'appareil, sera envoyé dès le retour de la connexion");
      return new Response(JSON.stringify({ queued: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}
