"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { QrCode, Plus, Download, X, Printer } from "lucide-react";

type Table = { id: number; number: string; capacity: number };
type Venue = { id: number; name: string; qrOrderingEnabled: boolean };

function TableQr({ url, label }: { url: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 200, margin: 1, color: { dark: "#1c1917", light: "#ffffff" } });
    }
  }, [url]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `qr-table-${label}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <Card className="print:break-inside-avoid">
      <CardContent className="flex flex-col items-center gap-3 p-5">
        <p className="text-sm font-semibold">Table {label}</p>
        <canvas ref={canvasRef} className="rounded-lg border border-border" />
        <p className="max-w-[200px] truncate text-center text-xs text-muted-foreground">{url}</p>
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="h-3.5 w-3.5" /> Télécharger
        </Button>
      </CardContent>
    </Card>
  );
}

export default function QrCodesPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));

  const targetVenueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;
  const currentVenue = venues.find((v) => v.id === targetVenueId) as Venue | undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["tables", venueParam],
    queryFn: async () => (await fetch(`/api/tables?venueId=${venueParam}`)).json(),
  });
  const tables: Table[] = data?.tables ?? [];

  const createTable = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Table ajoutée");
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      setShowForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleQrOrdering = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/venues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetVenueId, qrOrderingEnabled: enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Préférence mise à jour");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">QR Codes tables</h1>
          <p className="text-sm text-muted-foreground">
            Génère un QR code par table à imprimer et coller sur chaque table.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer tout
          </Button>
          {can(user?.role, "manageVenues") && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> Table
            </Button>
          )}
        </div>
      </div>

      {can(user?.role, "manageVenues") && (
        <Card className="print:hidden">
          <CardContent className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Commande par QR code</p>
                <p className="text-xs text-muted-foreground">
                  Permet aux clients de scanner le QR de leur table pour consulter le menu.
                </p>
              </div>
            </div>
            <Button
              variant={currentVenue?.qrOrderingEnabled ? "destructive" : "primary"}
              size="sm"
              loading={toggleQrOrdering.isPending}
              onClick={() => toggleQrOrdering.mutate(!currentVenue?.qrOrderingEnabled)}
            >
              {currentVenue?.qrOrderingEnabled ? "Désactiver" : "Activer"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 print:grid-cols-2">
        {origin &&
          tables.map((t) => (
            <TableQr key={t.id} label={t.number} url={`${origin}/order/${targetVenueId}/${t.id}`} />
          ))}
        {!isLoading && tables.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground print:hidden">
            Aucune table configurée. Ajoute des tables pour générer leurs QR codes.
          </p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouvelle table</h3>
              <button onClick={() => setShowForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createTable.mutate({
                  venueId: targetVenueId,
                  number: String(form.get("number")),
                  capacity: Number(form.get("capacity") || 4),
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Numéro de table</Label>
                <Input name="number" placeholder="Ex: 12" required />
              </div>
              <div>
                <Label>Capacité (personnes)</Label>
                <Input name="capacity" type="number" min={1} defaultValue={4} required />
              </div>
              <Button type="submit" className="w-full" loading={createTable.isPending}>
                Ajouter
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
