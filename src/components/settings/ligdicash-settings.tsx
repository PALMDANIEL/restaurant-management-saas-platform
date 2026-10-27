"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";

type LigdicashSummary = { configured: boolean; apiKeyHint: string | null; live: boolean };

/** Compte marchand LigdiCash de l'entreprise (réservé au propriétaire). */
export function LigdicashSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => (await fetch("/api/payment-settings")).json(),
  });
  const settings: LigdicashSummary | undefined = data?.ligdicash;

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (_data, payload) => {
      toast.success(payload.remove ? "Compte LigdiCash retiré" : "Compte LigdiCash enregistré");
      queryClient.invalidateQueries({ queryKey: ["payment-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base font-semibold text-foreground">
          <span className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" /> Paiement LigdiCash
          </span>
          {settings && (
            <Badge
              className={
                settings.configured
                  ? settings.live
                    ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                    : "border-amber-200 bg-amber-100 text-amber-700"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              {settings.configured ? (settings.live ? "Actif" : "Mode test") : "Non configuré"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          key={`${settings?.apiKeyHint}-${settings?.live}`}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const apiKey = String(form.get("apiKey") || "").trim();
            const authToken = String(form.get("authToken") || "").trim();
            if (!settings?.configured && (!apiKey || !authToken)) {
              toast.error("Renseignez la clé API et le jeton d'authentification.");
              return;
            }
            save.mutate({
              apiKey: apiKey || undefined,
              authToken: authToken || undefined,
              live: form.get("live") === "on",
            });
          }}
          className="space-y-3"
        >
          <p className="text-xs text-muted-foreground">
            Vos clients paient par Orange Money ou Moov Money en scannant un QR code à la caisse. L&apos;argent arrive
            directement sur votre compte marchand LigdiCash (ligdicash.com, rubrique API de votre projet).
          </p>
          <div>
            <Label>Clé API (Apikey)</Label>
            <Input
              name="apiKey"
              autoComplete="off"
              placeholder={
                settings?.apiKeyHint ? `Enregistrée (${settings.apiKeyHint}) — laisser vide pour garder` : ""
              }
            />
          </div>
          <div>
            <Label>Jeton d&apos;authentification (Bearer)</Label>
            <Input
              name="authToken"
              type="password"
              autoComplete="off"
              placeholder={settings?.configured ? "Enregistré — laisser vide pour garder" : ""}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="live" defaultChecked={settings?.live ?? false} className="h-4 w-4" />
            Encaisser pour de vrai (décoché : serveur de test LigdiCash)
          </label>
          <div className="flex gap-2">
            <Button type="submit" loading={save.isPending && !save.variables?.remove}>
              Enregistrer
            </Button>
            {settings?.configured && (
              <Button
                type="button"
                variant="outline"
                loading={save.isPending && !!save.variables?.remove}
                onClick={() => save.mutate({ remove: true })}
              >
                Retirer
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
