export type BehaviorScores = {
  courtesy: number;
  appearance: number;
  teamwork: number;
  rigor: number;
  responsiveness: number;
};

export type StaffDay = {
  id: number;
  firstName: string;
  lastName: string;
  workDate: string;
  shiftGroup: "jour" | "soir" | null;
  orderCount: number;
  totalSales: number;
  averageTicket: number;
  attendance: { id: number; clockIn: string; clockOut: string | null; corrected: boolean; correctionNote: string | null }[];
  minutesWorked: number;
  currentlyClocked: boolean;
  punctuality: {
    scheduledStart: string;
    scheduledEnd: string;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    score: number;
  } | null;
  behavior: (BehaviorScores & { id: number; comment: string | null; score: number }) | null;
  salesScore: number | null;
  note: number | null;
  provisional: boolean;
  absent: boolean;
};

export const BEHAVIOR_LABELS: { key: keyof BehaviorScores; label: string; hint: string }[] = [
  { key: "courtesy", label: "Accueil et politesse", hint: "Sourire, salutation, ton avec les clients" },
  { key: "appearance", label: "Tenue", hint: "Uniforme, propreté, présentation" },
  { key: "teamwork", label: "Esprit d'équipe", hint: "Entraide, respect des collègues et de la hiérarchie" },
  { key: "rigor", label: "Rigueur", hint: "Commandes justes, argent remis, consignes suivies" },
  { key: "responsiveness", label: "Réactivité", hint: "Attention aux tables, rapidité, disponibilité" },
];

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
export function noteTone(note: number | null) {
  if (note === null) return "border-slate-300 bg-slate-50 text-slate-600";
  if (note >= 16) return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (note >= 12) return "border-sky-300 bg-sky-50 text-sky-700";
  if (note >= 8) return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-red-300 bg-red-50 text-red-700";
}
export function noteLabel(note: number | null) {
  if (note === null) return "—";
  if (note >= 16) return "Excellent";
  if (note >= 12) return "Bien";
  if (note >= 8) return "Passable";
  return "Insuffisant";
}

/** Valeur pour <input type="datetime-local"> à partir d'une date ISO, en heure locale. */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
