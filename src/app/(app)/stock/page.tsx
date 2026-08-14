"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { ArrowDownCircle, ArrowUpCircle, PackagePlus, RotateCcw, X } from "lucide-react";

type Movement = {
  id: number;
  type: string;
  quantity: string;
  reason: string | null;
  createdAt: string;
  productName: string;
};
type Product = { id: number; name: string; stockQuantity: string; stockAlertThreshold: string; unit: string };

const TYPE_LABELS: Record<string, string> = {
  in: "Entrée",
  out: "Sortie",
  adjustment: "Ajustement",
  loss: "Perte",
};
const TYPE_ICONS: Record<string, typeof ArrowUpCircle> = {
  in: ArrowUpCircle,
  out: ArrowDownCircle,
  adjustment: RotateCcw,
  loss: ArrowDownCircle,
};

export default function StockPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const targetVenueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;

  const { data: productsData } = useQuery({
    queryKey: ["products", venueParam],
    queryFn: async () => (await fetch(`/api/products?venueId=${venueParam}`)).json(),
  });
  const { data: movementsData, isLoading } = useQuery({
    queryKey: ["stock", venueParam],
    queryFn: async () => (await fetch(`/api/stock?venueId=${venueParam}`)).json(),
    refetchInterval: 10000,
  });

  const products: Product[] = productsData?.products ?? [];
  const movements: Movement[] = movementsData?.movements ?? [];

  const createMovement = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Mouvement de stock enregistré");
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setShowForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lowStockProducts = products.filter(
    (p) => Number(p.stockQuantity) <= Number(p.stockAlertThreshold)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestion du Stock</h1>
          <p className="text-sm text-muted-foreground">
            Suivez les entrées, sorties et alertes en temps réel.
          </p>
        </div>
        {can(user?.role, "manageStock") && (
          <Button onClick={() => setShowForm(true)}>
            <PackagePlus className="h-4 w-4" /> Nouveau mouvement
          </Button>
        )}
      </div>

      {lowStockProducts.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              ⚠️ {lowStockProducts.length} produit(s) nécessitent votre attention
            </p>
            <div className="flex flex-wrap gap-2">
              {lowStockProducts.map((p) => (
                <span
                  key={p.id}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    Number(p.stockQuantity) <= 0
                      ? "bg-red-200 text-red-800"
                      : "bg-amber-200 text-amber-800"
                  )}
                >
                  {p.name}: {p.stockQuantity} {p.unit}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Valeur & état du stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2">Produit</th>
                    <th className="pb-2">Stock</th>
                    <th className="pb-2">Seuil</th>
                    <th className="pb-2">État</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="py-2 font-medium">{p.name}</td>
                      <td className="py-2">{p.stockQuantity} {p.unit}</td>
                      <td className="py-2 text-muted-foreground">{p.stockAlertThreshold}</td>
                      <td className="py-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            Number(p.stockQuantity) <= 0
                              ? "bg-red-100 text-red-700"
                              : Number(p.stockQuantity) <= Number(p.stockAlertThreshold)
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          )}
                        >
                          {Number(p.stockQuantity) <= 0
                            ? "Rupture"
                            : Number(p.stockQuantity) <= Number(p.stockAlertThreshold)
                            ? "Faible"
                            : "OK"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historique des mouvements</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[420px] space-y-2 overflow-y-auto">
            {isLoading && <p className="text-sm text-muted-foreground">Chargement...</p>}
            {movements.map((m) => {
              const Icon = TYPE_ICONS[m.type];
              return (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      m.type === "in" ? "text-emerald-500" : "text-red-500"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_LABELS[m.type]} · {m.quantity} · {formatDate(m.createdAt, true)}
                    </p>
                  </div>
                </div>
              );
            })}
            {movements.length === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground">Aucun mouvement enregistré.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouveau mouvement de stock</h3>
              <button onClick={() => setShowForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createMovement.mutate({
                  venueId: targetVenueId,
                  productId: Number(form.get("productId")),
                  type: String(form.get("type")),
                  quantity: Number(form.get("quantity")),
                  reason: String(form.get("reason") || ""),
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Produit</Label>
                <Select name="productId" required>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (stock: {p.stockQuantity})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Type de mouvement</Label>
                <Select name="type" required>
                  <option value="in">Entrée (achat/réapprovisionnement)</option>
                  <option value="out">Sortie manuelle</option>
                  <option value="adjustment">Ajustement d&apos;inventaire</option>
                  <option value="loss">Perte / Casse</option>
                </Select>
              </div>
              <div>
                <Label>Quantité</Label>
                <Input name="quantity" type="number" step="0.01" required />
              </div>
              <div>
                <Label>Motif (optionnel)</Label>
                <Textarea name="reason" placeholder="Ex: Livraison fournisseur, inventaire mensuel..." />
              </div>
              <Button type="submit" className="w-full" loading={createMovement.isPending}>
                Enregistrer
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
