"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";

export function useSession() {
  const setUser = useAppStore((s) => s.setUser);
  const setVenues = useAppStore((s) => s.setVenues);

  const query = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error("Failed to load session");
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.data) {
      setUser(query.data.user);
      setVenues(query.data.venues || []);
    }
  }, [query.data, setUser, setVenues]);

  return query;
}
