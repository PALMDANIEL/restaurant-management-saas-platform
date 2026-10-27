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
import { usePaymentFields, PaymentFields, buildPaymentPayload } from "@/components/pos/payment-fields";
import { LigdicashCheckout } from "@/components/pos/ligdicash-checkout";
import { Plus, Minus, Trash2, ShoppingCart, Search, X } from "lucide-react";

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
  const paymentFields = usePaymentFields("cash");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [ligdicash, setLigdicash] = useState<{ orderId: number; cashSessionId: number; creditNoteCode?: string } | null>(
    null
  );

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
        if (isKitchenSend) {
          toast.success("Commande envoyée en cuisine");
        } else if (data.creditNoteIssued) {
          toast.success(
            `Vente enregistrée — avoir ${data.creditNoteIssued.code} émis (${formatFcfa(data.creditNoteIssued.amount)})`,
            {
              action: {
                label: "Voir le reçu",
                onClick: () => window.open(`/receipt/${data.order.id}`, "_blank"),
              },
            }
          );
        } else {
          toast.success("Vente enregistrée", {
            action: {
              label: "Voir le reçu",
              onClick: () => window.open(`/receipt/${data.order.id}`, "_blank"),
            },
          });
        }
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
      paymentFields.reset();
      setMobileCartOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // LigdiCash : la commande est d'abord enregistrée, puis réglée quand le client a payé
  // depuis son téléphone (pas de file hors ligne : le paiement exige une connexion).
  const startLigdicash = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      setLigdicash({
        orderId: data.order.id,
        cashSessionId: currentSession!.id,
        creditNoteCode: paymentFields.appliedCreditNote?.code,
      });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setCart([]);
      setTableId("");
      setServerId("");
      paymentFields.reset();
      setMobileCartOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function checkout() {
    if (cart.length === 0) return;
    if (!currentSession) {
      toast.error("Ouvre une session de caisse avant d'encaisser une vente.");
      return;
    }
    if (paymentFields.method === "ligdicash" && (paymentFields.appliedCreditNote?.remainingAmount ?? 0) < total) {
      startLigdicash.mutate({
        venueId: targetVenueId,
        tableId: tableId ? Number(tableId) : null,
        serverId: serverId ? Number(serverId) : null,
        items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      });
      return;
    }
    createOrder.mutate({
      venueId: targetVenueId,
      tableId: tableId ? Number(tableId) : null,
      serverId: serverId ? Number(serverId) : null,
      items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      immediatePayment: buildPaymentPayload(paymentFields, currentSession.id),
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

  const cartLines = cart.length;
  const cartItemsCount = cart.reduce((n, l) => n + l.quantity, 0);

  const cartBody = (
    <div className="space-y-4">
      {!currentSession && (
        <p className="rounded-lg bg-sun-soft p-2 text-xs font-medium text-sun">
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
          <div key={l.productId} className="flex items-center gap-2 rounded-xl border border-border p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{formatFcfa(l.price)}</p>
            </div>
            <button onClick={() => changeQty(l.productId, -1)} className="rounded-md border border-border p-1.5 active:scale-95">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-6 text-center text-sm font-medium tabular-nums">{l.quantity}</span>
            <button onClick={() => changeQty(l.productId, 1)} className="rounded-md border border-border p-1.5 active:scale-95">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => removeLine(l.productId)} className="rounded-md p-1.5 text-red-500 active:scale-95">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {cart.length === 0 && (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Le panier est vide.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold text-muted-foreground">Total</span>
        <span className="font-mono text-xl font-bold tabular-nums text-primary-strong">{formatFcfa(total)}</span>
      </div>

      <PaymentFields state={paymentFields} total={total} venueId={targetVenueId} />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={cart.length === 0} loading={createOrder.isPending} onClick={sendToKitchen}>
          Cuisine
        </Button>
        <Button
          disabled={cart.length === 0 || !currentSession}
          loading={createOrder.isPending || startLigdicash.isPending}
          onClick={checkout}
        >
          Encaisser
        </Button>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 pb-24 lg:grid-cols-3 lg:pb-0">
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
            const inCart = cart.find((l) => l.productId === p.id);
            return (
              <button
                key={p.id}
                disabled={outOfStock}
                onClick={() => addToCart(p)}
                className={cn(
                  "relative flex flex-col items-start rounded-2xl border bg-card p-3 text-left transition-all active:scale-[0.97]",
                  outOfStock
                    ? "border-border opacity-40"
                    : inCart
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-border hover:border-primary/50 hover:shadow-sm"
                )}
              >
                {inCart && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground shadow-sm">
                    {inCart.quantity}
                  </span>
                )}
                <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
                <span className="mt-1 font-mono text-sm font-semibold text-primary-strong">{formatFcfa(p.price)}</span>
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

      {/* Desktop cart panel */}
      <Card className="hidden h-fit lg:sticky lg:top-4 lg:block">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="h-4 w-4 text-primary" /> Commande en cours
          </div>
          {cartBody}
        </CardContent>
      </Card>

      {/* Mobile floating cart bar */}
      {cartLines > 0 && !mobileCartOpen && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between rounded-2xl bg-sidebar px-4 py-3.5 text-white shadow-lg shadow-black/25 lg:hidden animate-rise"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold">
              {cartItemsCount}
            </span>
            Voir le panier
          </span>
          <span className="font-mono text-sm font-bold">{formatFcfa(total)}</span>
        </button>
      )}

      {/* Mobile cart drawer */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileCartOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 pb-safe animate-rise">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShoppingCart className="h-4 w-4 text-primary" /> Commande en cours
              </div>
              <button onClick={() => setMobileCartOpen(false)} className="rounded-lg p-1.5 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            {cartBody}
          </div>
        </div>
      )}

      {ligdicash && (
        <LigdicashCheckout
          {...ligdicash}
          onPaid={(invoice) => {
            setLigdicash(null);
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["cash-sessions"] });
            toast.success("Vente réglée par LigdiCash", {
              action: { label: "Voir le reçu", onClick: () => window.open(`/receipt/${invoice.orderId}`, "_blank") },
            });
          }}
          onClose={() => {
            toast.info(`Commande #${ligdicash.orderId} enregistrée, à encaisser depuis Commandes.`);
            setLigdicash(null);
          }}
        />
      )}
    </div>
  );
}
