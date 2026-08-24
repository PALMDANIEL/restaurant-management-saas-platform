"use client";

import { useAppStore } from "@/store/app-store";

/** Returns the current venue query param to append to API requests. */
export function useVenueParam() {
  const selectedVenueId = useAppStore((s) => s.selectedVenueId);
  return selectedVenueId === "all" ? "all" : String(selectedVenueId);
}

export async function fetchJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Une erreur est survenue");
  }
  return data as T;
}
