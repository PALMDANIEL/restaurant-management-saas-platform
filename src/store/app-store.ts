import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AuthUser = {
  id: number;
  email: string;
  role: "super_admin" | "gerant" | "manager" | "caissier" | "serveuse";
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  companyId: number;
  matricule?: string | null;
};

export type VenueOption = {
  id: number;
  name: string;
  type: string;
  active: boolean;
  qrOrderingEnabled: boolean;
};

type AppState = {
  user: AuthUser | null;
  venues: VenueOption[];
  selectedVenueId: number | "all";
  setUser: (u: AuthUser | null) => void;
  setVenues: (v: VenueOption[]) => void;
  setSelectedVenueId: (id: number | "all") => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      venues: [],
      selectedVenueId: "all",
      setUser: (user) => set({ user }),
      setVenues: (venues) => set({ venues }),
      setSelectedVenueId: (selectedVenueId) => set({ selectedVenueId }),
    }),
    {
      name: "maquis-app-store",
      partialize: (state) => ({ selectedVenueId: state.selectedVenueId }),
    }
  )
);
