/**
 * Une "journée d'exploitation" (business day) permet de rattacher le service du soir — qui
 * déborde après minuit jusqu'à l'aube — à la soirée où il a commencé, plutôt qu'au calendrier
 * strict. Exemple : avec une aube fixée à 06:00, une vente ou un pointage à 01h30 le mardi
 * appartient encore à la journée d'exploitation du lundi.
 */

function parseHourMinute(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { hour: h || 0, minute: m || 0 };
}

/** Renvoie la date (YYYY-MM-DD, heure locale) d'exploitation à laquelle rattacher `date`. */
export function getBusinessDate(date: Date, nightEndTime: string): string {
  const { hour, minute } = parseHourMinute(nightEndTime);
  const d = new Date(date);
  const beforeDawn = d.getHours() < hour || (d.getHours() === hour && d.getMinutes() < minute);
  if (beforeDawn) {
    d.setDate(d.getDate() - 1);
  }
  return toDateKey(d);
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Bornes [start, end) en heure locale couvrant une journée d'exploitation donnée. */
export function businessDateRange(dateKey: string, nightEndTime: string): { start: Date; end: Date } {
  const { hour, minute } = parseHourMinute(nightEndTime);
  const [y, m, d] = dateKey.split("-").map(Number);
  const start = new Date(y, m - 1, d, hour, minute, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}
