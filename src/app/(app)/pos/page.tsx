"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { queueOrder, isNetworkError } from "@/lib/offline-queue";
import { playOrderChime } from "@/lib/order-chime";
import { Plus, Minus, Trash2, ShoppingCart, Search } from "lucide-react";

type Product = {
  id: number;
  name: string;
  price: number;
  categoryId: number | null;
  stockQuantity: string;
  unit: string;
  active: boolean;
};
type Category = { id: number; name: string };
type Table = { id: number; number: string; capacity: number };
type Server = { id: number; firstName: string; lastName: string };
type CartLine = { productId: number; name: string; price: number; quantity: number };

function formatFcfa(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export default function PosPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tableId, setTableId] = useState<string>("");
  const [serverId, setServerId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const targetVenueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;

  const { data: productsData } = useQuery({
    queryKey: ["products", venueParam],
    queryFn: async () => (await fetch(`/api/products?venueId=${venueParam}`)).json(),
  });
  const { data: categoriesData } = useQuery({
    queryKey: ["categories", venueParam],
    queryFn: async () => (await fetch(`/api/categories?venueId=${venueParam}`)).json(),
  });
  const { data: tablesData } = useQuery({
    queryKey: ["tables", venueParam],
    queryFn: async () => (await fetch(`/api/tables?venueId=${venueParam}`)).json(),
  });
  const { data: serversData } = useQuery({
    queryKey: ["servers", venueParam],
    queryFn: async () => (await fetch(`/api/servers?venueId=${targetVenueId}`)).json(),
    enabled: !!targetVenueId,
  });
  const { data: cashData } = useQuery({
    queryKey: ["cash-sessions", venueParam],
    queryFn: async () => (await fetch(`/api/cash-sessions?venueId=${venueParam}`)).json(),
  });

  const products: Product[] = (productsData?.products ?? []).filter((p: Product) => p.active);
  const categories: Category[] = categoriesData?.categories ?? [];
  const tables: Table[] = tablesData?.tables ?? [];
  const servers: Server[] = serversData?.servers ?? [];
  const currentSession = (cashData?.sessions ?? []).find(
    (s: { venueId: number; status: string }) => s.venueId === targetVenueId && s.status === "open"
  );

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || String(p.categoryId) === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter]);

  const total = cart.reduce((sum, l) => sum + l.price * l.quantity, 0);

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { productId: p.id, name: p.name, price: p.price, quantity: 1 }];
    });
  }

  function changeQty(productId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  function removeLine(productId: number) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  const createOrder = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        return { ...(await res.json()), queued: false };
      } catch (err) {
        if (isNetworkError(err)) {
          const table = tables.find((t) => String(t.id) === tableId);
          const summary = `${table ? `Table ${table.number}` : "À emporter"} — ${formatFcfa(total)}`;
          await queueOrder(payload, summary);
          return { queued: true };
        }
        throw err;
      }
    },
    onSuccess: (data, variables) => {
      const payload = variables as Record<string, unknown>;
      const isKitchenSend = !payload.immediatePayment;
      if (data.queued) {
        toast.warning(
          isKitchenSend
            ? "Hors ligne — commande enregistrée localement, sera envoyée dès le retour de la connexion"
            : "Hors ligne — vente enregistrée localement, sera envoyée dès le retour de la connexion"
        );
      } else {
        toast.success(isKitchenSend ? "Commande envoyée en cuisine" : "Vente enregistrée");
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
      // Retour sonore immédiat pour la personne qui vient d'envoyer en cuisine (le reste du
      // personnel, lui, sera alerté par le bip global dès que la notification arrive).
      if (isKitchenSend) playOrderChime();
      setCart([]);
      setTableId("");
      setServerId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function checkout() {
    if (cart.length === 0) return;
    if (!currentSession) {
      toast.error("Ouvre une session de caisse avant d'encaisser une vente.");
      return;
    }
    createOrder.mutate({
      venueId: targetVenueId,
      tableId: tableId ? Number(tableId) : null,
      serverId: serverId ? Number(serverId) : null,
      items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      immediatePayment: { method: paymentMethod, cashSessionId: currentSession.id },
    });
  }

  function sendToKitchen() {
    if (cart.length === 0) return;
    createOrder.mutate({
      venueId: targetVenueId,
      tableId: tableId ? Number(tableId) : null,
      serverId: serverId ? Number(serverId) : null,
      items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher un produit..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">Toutes les catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const outOfStock = Number(p.stockQuantity) <= 0;
            return (
              <button
                key={p.id}
                disabled={outOfStock}
                onClick={() => addToCart(p)}
                className={cn(
                  "flex flex-col items-start rounded-2xl border border-border bg-card p-3 text-left transition-all active:scale-[0.97]",
                  outOfStock ? "opacity-40" : "hover:border-primary hover:shadow-sm"
                )}
              >
                <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
                <span className="mt-1 text-sm font-semibold text-primary">{formatFcfa(p.price)}</span>
                <span className="mt-0.5 text-xs text-muted-foreground">
                  {outOfStock ? "Rupture" : `${p.stockQuantity} ${p.unit}`}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">Aucun produit trouvé.</p>
          )}
        </div>
      </div>

      <Card className="h-fit lg:sticky lg:top-4">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="h-4 w-4" /> Commande en cours
          </div>

          {!currentSession && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/30">
              ⚠️ Aucune caisse ouverte — l&apos;encaissement immédiat sera indisponible.
            </p>
          )}

          <Select value={tableId} onChange={(e) => setTableId(e.target.value)}>
            <option value="">Sans table (à emporter)</option>
            {tables.map((t) => (
              <option key={t.id} value={String(t.id)}>
                Table {t.number} ({t.capacity} pers.)
              </option>
            ))}
          </Select>

          <Select value={serverId} onChange={(e) => setServerId(e.target.value)}>
            <option value="">Serveuse non assignée</option>
            {servers.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </Select>

          <div className="max-h-[320px] space-y-2 overflow-y-auto">
            {cart.map((l) => (
              <div key={l.productId} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFcfa(l.price)}</p>
                </div>
                <button onClick={() => changeQty(l.productId, -1)} className="rounded-md border border-border p-1">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-sm font-medium">{l.quantity}</span>
                <button onClick={() => changeQty(l.productId, 1)} className="rounded-md border border-border p-1">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => removeLine(l.productId)} className="rounded-md p-1 text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {cart.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Le panier est vide.</p>}
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3 text-base font-bold">
            <span>Total</span>
            <span>{formatFcfa(total)}</span>
          </div>

          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="cash">Espèces</option>
            <option value="card">Carte</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="mixed">Paiement mixte</option>
          </Select>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={cart.length === 0} loading={createOrder.isPending} onClick={sendToKitchen}>
              Envoyer en cuisine
            </Button>
            <Button disabled={cart.length === 0 || !currentSession} loading={createOrder.isPending} onClick={checkout}>
              Encaisser
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
