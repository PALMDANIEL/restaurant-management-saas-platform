"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { Truck, Plus, X, PackageCheck, Trash2 } from "lucide-react";

type Supplier = { id: number; name: string; contactName: string | null; phone: string | null; email: string | null };
type Product = { id: number; name: string };
type SupplierOrderItem = { id: number; productId: number | null; description: string | null; quantity: string; unitCost: number };
type SupplierOrder = {
  id: number;
  supplierId: number;
  supplierName: string;
  status: "pending" | "received" | "cancelled";
  totalAmount: number;
  paidAmount: number;
  orderDate: string;
  receivedDate: string | null;
  items: SupplierOrderItem[];
};

const STATUS_LABELS: Record<string, string> = { pending: "En attente", received: "Reçue", cancelled: "Annulée" };
const STATUS_CLASSES: Record<string, string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-700",
  received: "border-emerald-300 bg-emerald-50 text-emerald-700",
  cancelled: "border-red-300 bg-red-50 text-red-700",
};

function formatFcfa(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export default function SuppliersPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderLines, setOrderLines] = useState([{ description: "", quantity: 1, unitCost: 0 }]);

  const targetVenueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers", venueParam],
    queryFn: async () => (await fetch(`/api/suppliers?venueId=${venueParam}`)).json(),
  });
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["supplier-orders", venueParam],
    queryFn: async () => (await fetch(`/api/supplier-orders?venueId=${venueParam}`)).json(),
  });

  const suppliers: Supplier[] = suppliersData?.suppliers ?? [];
  const supplierOrders: SupplierOrder[] = ordersData?.supplierOrders ?? [];

  const createSupplier = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Fournisseur ajouté");
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setShowSupplierForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createOrder = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/supplier-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Commande fournisseur créée");
      queryClient.invalidateQueries({ queryKey: ["supplier-orders"] });
      setShowOrderForm(false);
      setOrderLines([{ description: "", quantity: 1, unitCost: 0 }]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receiveOrder = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch("/api/supplier-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "received" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Commande marquée comme reçue — stock mis à jour");
      queryClient.invalidateQueries({ queryKey: ["supplier-orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const orderTotal = orderLines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fournisseurs</h1>
          <p className="text-sm text-muted-foreground">Gérez vos fournisseurs et vos commandes d&apos;approvisionnement.</p>
        </div>
        {can(user?.role, "manageSuppliers") && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSupplierForm(true)}>
              <Plus className="h-4 w-4" /> Fournisseur
            </Button>
            <Button onClick={() => setShowOrderForm(true)} disabled={suppliers.length === 0}>
              <Plus className="h-4 w-4" /> Commande
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Fournisseurs ({suppliers.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suppliers.map((s) => (
              <div key={s.id} className="rounded-lg border border-border p-2.5">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.contactName || "—"} {s.phone ? `· ${s.phone}` : ""}
                </p>
              </div>
            ))}
            {suppliers.length === 0 && <p className="text-sm text-muted-foreground">Aucun fournisseur enregistré.</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Commandes fournisseurs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {supplierOrders.map((o) => (
              <div key={o.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    #{o.id} · {o.supplierName}
                  </span>
                  <Badge className={STATUS_CLASSES[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(o.orderDate)} · {o.items.length} article(s) · {formatFcfa(o.totalAmount)}
                </p>
                {o.status === "pending" && can(user?.role, "manageSuppliers") && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => receiveOrder.mutate(o.id)}>
                    <PackageCheck className="h-3.5 w-3.5" /> Marquer comme reçue
                  </Button>
                )}
              </div>
            ))}
            {!isLoading && supplierOrders.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucune commande fournisseur.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {showSupplierForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouveau fournisseur</h3>
              <button onClick={() => setShowSupplierForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createSupplier.mutate({
                  venueId: targetVenueId,
                  name: String(form.get("name")),
                  contactName: String(form.get("contactName") || "") || undefined,
                  phone: String(form.get("phone") || "") || undefined,
                  email: String(form.get("email") || "") || undefined,
                  address: String(form.get("address") || "") || undefined,
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Nom du fournisseur</Label>
                <Input name="name" required />
              </div>
              <div>
                <Label>Contact</Label>
                <Input name="contactName" />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input name="phone" />
              </div>
              <div>
                <Label>Email</Label>
                <Input name="email" type="email" />
              </div>
              <div>
                <Label>Adresse</Label>
                <Textarea name="address" />
              </div>
              <Button type="submit" className="w-full" loading={createSupplier.isPending}>
                Ajouter
              </Button>
            </form>
          </div>
        </div>
      )}

      {showOrderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouvelle commande fournisseur</h3>
              <button onClick={() => setShowOrderForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createOrder.mutate({
                  venueId: targetVenueId,
                  supplierId: Number(form.get("supplierId")),
                  orderDate: String(form.get("orderDate")),
                  notes: String(form.get("notes") || "") || undefined,
                  items: orderLines
                    .filter((l) => l.description.trim())
                    .map((l) => ({ description: l.description, quantity: l.quantity, unitCost: l.unitCost })),
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Fournisseur</Label>
                <Select name="supplierId" required>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Date de commande</Label>
                <Input name="orderDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>

              <div className="space-y-2">
                <Label>Articles</Label>
                {orderLines.map((line, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => {
                        const next = [...orderLines];
                        next[idx] = { ...next[idx], description: e.target.value };
                        setOrderLines(next);
                      }}
                    />
                    <Input
                      type="number"
                      min={0.01}
                      className="w-20"
                      placeholder="Qté"
                      value={line.quantity}
                      onChange={(e) => {
                        const next = [...orderLines];
                        next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                        setOrderLines(next);
                      }}
                    />
                    <Input
                      type="number"
                      min={0}
                      className="w-28"
                      placeholder="Coût unit."
                      value={line.unitCost}
                      onChange={(e) => {
                        const next = [...orderLines];
                        next[idx] = { ...next[idx], unitCost: Number(e.target.value) };
                        setOrderLines(next);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setOrderLines(orderLines.filter((_, i) => i !== idx))}
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOrderLines([...orderLines, { description: "", quantity: 1, unitCost: 0 }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
                </Button>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>Total</span>
                <span>{formatFcfa(orderTotal)}</span>
              </div>

              <div>
                <Label>Notes (optionnel)</Label>
                <Textarea name="notes" />
              </div>
              <Button type="submit" className="w-full" loading={createOrder.isPending}>
                Créer la commande
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
