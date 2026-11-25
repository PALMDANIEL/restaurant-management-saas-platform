"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { playMeetingBell, unlockAudioOnFirstTouch } from "@/lib/meeting-bell";

type Meeting = { id: number; title: string; place: string | null; startsAt: string; remind2h: boolean; remind1h: boolean };
type PlanningData = { serverNow: string; manager?: boolean; meetings?: Meeting[] };

const LEADS = [
  { minutes: 120, flag: "remind2h" as const, label: "2 h" },
  { minutes: 60, flag: "remind1h" as const, label: "1 h" },
];
const RING_WINDOW_MS = 5 * 60 * 1000; // au-delà, on prévient sans sonner (l'appli vient d'être ouverte)
const STORE = "dani-mak-rappels-reunions";

function seenKeys(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}
function remember(key: string, startsAt: number) {
  try {
    const all = seenKeys();
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const k of Object.keys(all)) if (all[k] < cutoff) delete all[k];
    all[key] = startsAt;
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    /* stockage indisponible : le rappel pourra sonner de nouveau, sans gravité */
  }
}

/**
 * Sonne 2 h et/ou 1 h avant chaque réunion qui concerne la personne connectée (réglage du manager),
 * sur n'importe quel écran. Fonctionne tant que l'application est ouverte (même en arrière-plan sur
 * ordinateur) ; une application fermée ne peut pas sonner. Les managers ne reçoivent pas la sonnerie
 * (ce sont eux qui ont programmé la réunion).
 */
export function useMeetingReminders() {
  const { data, dataUpdatedAt } = useQuery<PlanningData>({
    queryKey: ["me-planning"],
    queryFn: async () => {
      const res = await fetch("/api/me/planning");
      if (!res.ok) throw new Error("planning");
      return res.json();
    },
    refetchInterval: 60_000,
    retry: false,
  });
  const ref = useRef({ data, dataUpdatedAt });
  useEffect(() => {
    ref.current = { data, dataUpdatedAt };
  }, [data, dataUpdatedAt]);

  useEffect(() => unlockAudioOnFirstTouch(), []);

  useEffect(() => {
    const check = () => {
      const { data: d, dataUpdatedAt: at } = ref.current;
      if (!d || d.manager || !d.meetings?.length) return;
      // Heure du serveur : une horloge de téléphone déréglée ne décale pas les rappels.
      const skew = new Date(d.serverNow).getTime() - at;
      const now = Date.now() + skew;
      for (const m of d.meetings) {
        const start = new Date(m.startsAt).getTime();
        if (now >= start) continue;
        // Rappels dont l'heure est passée : on en annonce un seul (le plus proche de la réunion)
        // et on marque les autres comme vus, pour ne pas empiler deux bandeaux d'un coup.
        const due = LEADS.filter((l) => m[l.flag] && now >= start - l.minutes * 60_000);
        const fresh = due.filter((l) => !(`${m.id}:${l.minutes}:${start}` in seenKeys()));
        if (fresh.length === 0) continue;
        for (const l of due) remember(`${m.id}:${l.minutes}:${start}`, start);
        const lead = due[due.length - 1]; // LEADS est trié du plus lointain au plus proche
        const at = start - lead.minutes * 60_000;
        const hour = new Date(m.startsAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        const where = m.place ? ` · ${m.place}` : "";
        const late = now - at > RING_WINDOW_MS;
        const text = `Réunion « ${m.title} » à ${hour}${where}`;
        if (!late) playMeetingBell();
        toast(late ? `🔔 ${text}` : `🔔 Dans ${lead.label} : ${text}`, { duration: 15_000 });
        if (!late && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification(`Réunion dans ${lead.label}`, { body: text });
          } catch {
            /* notifications non disponibles sur cet appareil */
          }
        }
      }
    };
    check();
    const timer = setInterval(check, 15_000);
    return () => clearInterval(timer);
  }, []);
}
