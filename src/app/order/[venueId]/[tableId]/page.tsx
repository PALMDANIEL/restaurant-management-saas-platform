"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ShoppingCart, Plus, Minus, X, CheckCircle2, UtensilsCrossed } from "lucide-react";

type Product = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  categoryId: number | null;
  stockQuantity: string;
  unit: string;
};
type Category = { id: number; name: string };
type CartLine = { productId: number; name: string; price: number; quantity: number };

function formatFcfa(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export default function PublicOrderPage() {
  const params = useParams<{ venueId: string; tableId: string }>();
  const venueId = Number(params.venueId);
  const tableId = Number(params.tableId);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [activeCategory, setActiveCategory] = useState<number | "all">("all");
  const [submitted, setSubmitted] = useState<{ id: number; totalAmount: number } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["order-app", venueId, tableId],
    queryFn: async () => {
      const res = await fetch(`/api/order-app?venueId=${venueId}&tableId=${tableId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json;
    },
    retry: false,
  });

  const products: Product[] = useMemo(() => data?.products ?? [], [data]);
  const categories: Category[] = data?.categories ?? [];

  const filtered = useMemo(
    () => (activeCategory === "all" ? products : products.filter((p) => p.categoryId === activeCategory)),
    [products, activeCategory]
  );

  const total = cart.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { productId: p.id, name: p.name, price: p.price, quantity: 1 }];
    });
  }
  function changeQty(productId: number, delta: number) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  }

  const submitOrder = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/order-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: (data) => {
      setSubmitted(data.order);
      setCart([]);
      setShowCart(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <p className="text-sm text-stone-500">Chargement du menu...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-stone-50 p-6 text-center">
        <UtensilsCrossed className="h-8 w-8 text-stone-400" />
        <p className="font-medium text-stone-700">{(error as Error)?.message || "Menu indisponible."}</p>
        <p className="text-sm text-stone-500">Contacte le personnel pour passer ta commande.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-50 p-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <h1 className="text-xl font-bold">Commande envoyée !</h1>
        <p className="text-stone-600">
          Commande #{submitted.id} · {formatFcfa(submitted.totalAmount)}
        </p>
        <p className="max-w-xs text-sm text-stone-500">
          Ta commande a été transmise en cuisine. Le personnel viendra te servir à ta table.
        </p>
        <Button onClick={() => setSubmitted(null)}>Commander à nouveau</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 p-4 backdrop-blur">
        <h1 className="text-lg font-bold">{data.venue.name}</h1>
        <p className="text-sm text-stone-500">Table {data.table.number}</p>
      </header>

      <div className="sticky top-[65px] z-10 flex gap-2 overflow-x-auto border-b border-stone-200 bg-stone-50 p-3">
        <button
          onClick={() => setActiveCategory("all")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-sm",
            activeCategory === "all" ? "border-orange-500 bg-orange-500 text-white" : "border-stone-300 text-stone-600"
          )}
        >
          Tout
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm",
              activeCategory === c.id ? "border-orange-500 bg-orange-500 text-white" : "border-stone-300 text-stone-600"
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        {filtered.map((p) => {
          const inCart = cart.find((l) => l.productId === p.id);
          return (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}</p>
                {p.description && <p className="line-clamp-1 text-xs text-stone-500">{p.description}</p>}
                <p className="mt-1 text-sm font-semibold text-orange-600">{formatFcfa(p.price)}</p>
              </div>
              {inCart ? (
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => changeQty(p.id, -1)} className="rounded-full border border-stone-300 p-1.5">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center text-sm font-medium">{inCart.quantity}</span>
                  <button onClick={() => changeQty(p.id, 1)} className="rounded-full border border-stone-300 p-1.5">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button size="sm" onClick={() => addToCart(p)}>
                  Ajouter
                </Button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="col-span-full py-10 text-center text-sm text-stone-500">Aucun article disponible.</p>}
      </div>

      {itemCount > 0 && !showCart && (
        <button
          onClick={() => setShowCart(true)}
          className="fixed bottom-4 left-4 right-4 z-20 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-orange-600 px-5 py-3.5 text-white shadow-lg"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingCart className="h-4 w-4" /> {itemCount} article(s)
          </span>
          <span className="font-bold">{formatFcfa(total)}</span>
        </button>
      )}

      {showCart && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/50">
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Ton panier</h2>
              <button onClick={() => setShowCart(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              {cart.map((l) => (
                <div key={l.productId} className="flex items-center justify-between rounded-xl border border-stone-200 p-2.5">
                  <div>
                    <p className="text-sm font-medium">{l.name}</p>
                    <p className="text-xs text-stone-500">{formatFcfa(l.price)} × {l.quantity}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(l.productId, -1)} className="rounded-full border border-stone-300 p-1.5">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-medium">{l.quantity}</span>
                    <button onClick={() => changeQty(l.productId, 1)} className="rounded-full border border-stone-300 p-1.5">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                submitOrder.mutate({
                  venueId,
                  tableId,
                  customerName: String(form.get("customerName") || "") || undefined,
                  customerPhone: String(form.get("customerPhone") || "") || undefined,
                  items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
                });
              }}
              className="mt-4 space-y-3"
            >
              <Input name="customerName" placeholder="Ton nom (optionnel)" />
              <Input name="customerPhone" placeholder="Ton téléphone (optionnel)" />
              <div className="flex items-center justify-between border-t border-stone-200 pt-3 text-base font-bold">
                <span>Total</span>
                <span>{formatFcfa(total)}</span>
              </div>
              <Button type="submit" className="w-full" loading={submitOrder.isPending} disabled={cart.length === 0}>
                Envoyer ma commande
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
