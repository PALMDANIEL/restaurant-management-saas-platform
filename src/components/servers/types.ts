import type { ScoringRules } from "@/lib/staff-scoring-rules";

export type { ScoringRules };

export type StaffDay = {
  id: number;
  firstName: string;
  lastName: string;
  workDate: string;
  shiftGroup: "jour" | "soir" | null;
  orderCount: number;
  totalSales: number;
  averageTicket: number;
  attendance: {
    id: number;
    clockIn: string;
    clockOut: string | null;
    corrected: boolean;
    correctionNote: string | null;
  }[];
  minutesWorked: number;
  currentlyClocked: boolean;
  punctuality: {
    scheduledStart: string;
    scheduledEnd: string;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    latePoints: number;
    earlyPoints: number;
    score: number;
  } | null;
  behavior: { id: number; scores: Record<string, number>; comment: string | null; score: number | null } | null;
  salesScore: number | null;
  note: number | null;
  provisional: boolean;
  absent: boolean;
};

export type StaffUser = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  active: boolean;
  matricule: string | null;
  shiftGroup: "jour" | "soir" | null;
};

export type ShiftSettings = {
  venueId: number;
  dayStartTime: string;
  dayEndTime: string;
  nightStartTime: string;
  nightEndTime: string;
};

export type MonthlyPerf = {
  id: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgServiceMinutes: number | null;
  score: number | null;
};

/** Couleurs des trois composantes de la note, reprises partout (barres, réglages, légendes). */
export const PART_STYLE = {
  sales: { label: "Ventes", bar: "bg-primary", text: "text-primary-strong", soft: "bg-primary/10" },
  behavior: { label: "Comportement", bar: "bg-accent", text: "text-accent", soft: "bg-accent/10" },
  punctuality: { label: "Ponctualité", bar: "bg-sun", text: "text-sun", soft: "bg-sun-soft" },
} as const;

export const STAR_WORDS = ["", "À reprendre", "Insuffisant", "Correct", "Bien", "Excellent"];

export function formatFcfa(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}
export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
export function formatHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}
export function formatNote(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}
export function formatDay(
  dateKey: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }
) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("fr-FR", opts);
}

/** Ton (couleurs du thème, lisibles en clair comme en sombre) selon la note sur 20. */
export function noteTone(note: number | null) {
  if (note === null)
    return {
      text: "text-muted-foreground",
      ring: "stroke-border",
      chip: "border-border bg-muted text-muted-foreground",
    };
  if (note >= 14)
    return { text: "text-accent", ring: "stroke-accent", chip: "border-accent/25 bg-accent/10 text-accent" };
  if (note >= 10) return { text: "text-sun", ring: "stroke-sun", chip: "border-sun/30 bg-sun-soft text-sun" };
  return {
    text: "text-red-600 dark:text-red-400",
    ring: "stroke-red-500",
    chip: "border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400",
  };
}
export function noteLabel(note: number | null) {
  if (note === null) return "Pas de note";
  if (note >= 16) return "Excellent";
  if (note >= 14) return "Très bien";
  if (note >= 12) return "Bien";
  if (note >= 10) return "Passable";
  return "Insuffisant";
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function shiftDateKey(key: string, days: number) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Valeur pour <input type="datetime-local"> à partir d'une date ISO, en heure locale. */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
