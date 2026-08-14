import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number, currency = "XOF") {
  return (
    new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 0,
    }).format(Math.round(amount)) +
    " " +
    currency
  );
}

export function formatDate(date: string | Date, withTime = false) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

/** Transforme un texte libre en slug conforme à /^[a-z0-9-]+$/ (minuscules, chiffres, tirets). */
export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function initials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Administrateur",
  gerant: "Gérant",
  manager: "Manager",
  caissier: "Caissier",
  serveuse: "Serveuse",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: "Nouvelle",
  preparing: "En préparation",
  served: "Servie",
  paid: "Payée",
  cancelled: "Annulée",
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 border-blue-200",
  preparing: "bg-amber-100 text-amber-700 border-amber-200",
  served: "bg-purple-100 text-purple-700 border-purple-200",
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  card: "Carte bancaire",
  mobile_money: "Mobile Money",
  mixed: "Mixte",
};
