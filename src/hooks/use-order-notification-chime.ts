"use client";

import { useEffect, useRef } from "react";
import { playOrderChime } from "@/lib/order-chime";

type ChimeableNotification = { id: number; type: string; read: boolean };

/**
 * Joue le carillon d'alerte dès qu'une notification "new_order" (commande envoyée en cuisine
 * par un caissier, ou commande passée par un client via QR code) apparaît qui n'était pas
 * présente au dernier rafraîchissement. Monté une seule fois dans AppShell : tout le personnel
 * connecté (serveuses, caissiers, manager, ...), sur n'importe quel écran, entend le bip —
 * pas seulement la personne qui a lancé la commande.
 * Ne sonne jamais au tout premier chargement (sinon les notifications déjà existantes sonneraient).
 */
export function useOrderNotificationChime(notifications: ChimeableNotification[] | undefined) {
  const knownIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!notifications) return;
    const currentIds = new Set(notifications.map((n) => n.id));

    if (knownIds.current === null) {
      knownIds.current = currentIds;
      return;
    }

    const hasNewOrderNotif = notifications.some(
      (n) => n.type === "new_order" && !n.read && !knownIds.current!.has(n.id)
    );
    if (hasNewOrderNotif) playOrderChime();

    knownIds.current = currentIds;
  }, [notifications]);
}
