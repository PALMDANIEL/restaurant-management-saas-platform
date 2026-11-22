"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            refetchOnWindowFocus: false,
            // Sans réseau, laisser la requête partir : le service worker répond avec la
            // copie gardée sur l'appareil (sinon la requête restait en pause et l'écran vide).
            networkMode: "always",
            retry: 1,
          },
          mutations: {
            // Sans cela, une vente faite hors connexion n'atteignait jamais la file d'attente.
            networkMode: "always",
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        {children}
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
