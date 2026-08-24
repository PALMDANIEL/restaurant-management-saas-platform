"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { usePaymentFields, PaymentFields, buildPaymentPayload } from "@/components/pos/payment-fields";
import { Clock, ChefHat, CheckCircle2, Wallet, XCircle, UtensilsCrossed } from "lucide-react";

type OrderItem = { id: number; productName: string; quantity: string; unitPrice: number };
type Order = {
  id: number;
  venueId: number;
  status: "new" | "preparing" | "served" | "paid" | "cancelled";
  totalAmount: number;
  serverId: number | null;
  tableNumber: string | null;
  serverName: string | null;
  notes: string | null;
  createdAt: string;
  items: OrderItem[];
};

type Server = { id: number; firstName: string; lastName: string };

const STATUS_CONFIG: Record<
  Order["status"],
  { label: string; className: string; bar: string; icon: typeof Clock }
> = {
  new: { label: "Nouvelle", className: "border-sky-300 bg-sky-50 text-sky-700", bar: "bg-sky-400", icon: Clock },
  preparing: { label: "En préparation", className: "border-sun/30 bg-sun-soft text-sun", bar: "bg-sun", icon: ChefHat },
  served: { label: "Servie", className: "border-violet-300 bg-violet-50 text-violet-700", bar: "bg-violet-400", icon: CheckCircle2 },
  paid: { label: "Encaissée", className: "border-accent/30 bg-accent/10 text-accent", bar: "bg-accent", icon: Wallet },
  cancelled: { label: "Annulée", className: "border-red-300 bg-red-50 text-red-700", bar: "bg-red-400", icon: XCircle },
};

const NEXT_STATUS: Partial<Record<Order["status"], Order["status"]>> = {
  new: "preparing",
  preparing: "served",
};

function formatFcfa(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export default function OrdersPage() {
  const venueParam = useVenueParam();
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null);
  const paymentFields = usePaymentFields("cash");

  function openCheckout(o: Order) {
    paymentFields.reset();
    setCheckoutOrder(o);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["orders", venueParam],
    queryFn: async () => (await fetch(`/api/orders?venueId=${venueParam}`)).json(),
    refetchInterval: 10000,
  });
  const { data: cashData } = useQuery({
    queryKey: ["cash-sessions", venueParam],
    queryFn: async () => (await fetch(`/api/cash-sessions?venueId=${venueParam}`)).json(),
  });
  const { data: serversData } = useQuery({
    queryKey: ["servers", venueParam],
    queryFn: async () => (await fetch(`/api/servers?venueId=${venueParam}`)).json(),
  });

  const servers: Server[] = serversData?.servers ?? [];

  const orders: Order[] = useMemo(() => data?.orders ?? [], [data]);
  const openSessions: { id: number; venueId: number; status: string }[] = cashData?.sessions ?? [];

  const filtered = useMemo(() => {
    if (statusFilter === "active") return orders.filter((o) => o.status === "new" || o.status === "preparing" || o.status === "served");
    if (statusFilter === "all") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const updateOrder = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.creditNoteIssued) {
        toast.success(
          `Commande encaissée — avoir ${data.creditNoteIssued.code} émis (${data.creditNoteIssued.amount.toLocaleString("fr-FR")} FCFA)`,
          { action: { label: "Voir le reçu", onClick: () => window.open(`/receipt/${data.order.id}`, "_blank") } }
        );
      } else {
        toast.success("Commande mise à jour", {
          action: data.order?.status === "paid"
            ? { label: "Voir le reçu", onClick: () => window.open(`/receipt/${data.order.id}`, "_blank") }
            : undefined,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setCheckoutOrder(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Salle & cuisine"
        title="Commandes"
        description="Suivez les commandes en cuisine et en salle, en temps réel."
        actions={
          <Select className="w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="active">En cours</option>
            <option value="all">Toutes</option>
            <option value="new">Nouvelles</option>
            <option value="preparing">En préparation</option>
            <option value="served">Servies</option>
            <option value="paid">Encaissées</option>
            <option value="cancelled">Annulées</option>
          </Select>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((o) => {
          const cfg = STATUS_CONFIG[o.status];
          const Icon = cfg.icon;
          const next = NEXT_STATUS[o.status];
          return (
            <Card key={o.id} className="relative overflow-hidden">
              <span className={cn("absolute inset-y-0 left-0 w-1", cfg.bar)} />
              <CardContent className="space-y-3 p-4 pl-5">
                <div className="flex items-center justify-between">
                  <span className="font-display font-semibold">
                    #{o.id}
                    {o.tableNumber ? ` · Table ${o.tableNumber}` : " · À emporter"}
                  </span>
                  <Badge className={cfg.className}>
                    <Icon className="h-3 w-3" /> {cfg.label}
                  </Badge>
                </div>
                <ul className="space-y-1 text-sm">
                  {o.items.map((it) => (
                    <li key={it.id} className="flex justify-between text-muted-foreground">
                      <span>
                        {it.quantity} × {it.productName}
                      </span>
                      <span className="font-mono tabular-nums">{formatFcfa(it.unitPrice * Number(it.quantity))}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                  {can(user?.role, "manageOrders") && o.status !== "paid" && o.status !== "cancelled" ? (
                    <Select
                      className="h-8 w-40 text-xs"
                      value={o.serverId ? String(o.serverId) : ""}
                      onChange={(e) =>
                        updateOrder.mutate({ id: o.id, serverId: e.target.value ? Number(e.target.value) : null })
                      }
                    >
                      <option value="">Serveuse non assignée</option>
                      {servers.map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.firstName} {s.lastName}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="text-muted-foreground">{o.serverName || "—"}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDate(o.createdAt, true)}</span>
                </div>
                <div className="flex items-center justify-end border-t border-border pt-2 text-sm">
                  <span className="font-mono text-base font-bold tabular-nums text-primary-strong">{formatFcfa(o.totalAmount)}</span>
                </div>
                {can(user?.role, "manageOrders") && o.status !== "paid" && o.status !== "cancelled" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {next && (
                      <Button size="sm" variant="outline" onClick={() => updateOrder.mutate({ id: o.id, status: next })}>
                        Marquer &quot;{STATUS_CONFIG[next].label}&quot;
                      </Button>
                    )}
                    {o.status === "served" && (
                      <Button size="sm" onClick={() => openCheckout(o)}>
                        <Wallet className="h-3.5 w-3.5" /> Encaisser
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => updateOrder.mutate({ id: o.id, status: "cancelled" })}
                    >
                      Annuler
                    </Button>
                  </div>
                )}
                {o.status === "paid" && (
                  <div className="flex justify-end pt-1">
                    <Button size="sm" variant="outline" onClick={() => window.open(`/receipt/${o.id}`, "_blank")}>
                      <Wallet className="h-3.5 w-3.5" /> Reçu
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!isLoading && filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border py-14 text-center">
            <UtensilsCrossed className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">Aucune commande dans cette vue.</p>
          </div>
        )}
      </div>

      {checkoutOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl bg-card p-6 shadow-xl pb-safe sm:rounded-2xl">
            <h3 className="mb-4 font-display text-lg font-semibold">Encaisser #{checkoutOrder.id}</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const cashSessionId = Number(form.get("cashSessionId"));
                if (!cashSessionId) {
                  toast.error("Ouvre une session de caisse avant d'encaisser.");
                  return;
                }
                const { method, ...rest } = buildPaymentPayload(paymentFields, cashSessionId);
                updateOrder.mutate({
                  id: checkoutOrder.id,
                  status: "paid",
                  paymentMethod: method,
                  ...rest,
                });
              }}
              className="space-y-3"
            >
              <p className="font-mono text-2xl font-bold tabular-nums">{formatFcfa(checkoutOrder.totalAmount)}</p>
              <Select name="cashSessionId" required>
                <option value="">Session de caisse...</option>
                {openSessions
                  .filter((s) => s.status === "open")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      Session #{s.id}
                    </option>
                  ))}
              </Select>
              <PaymentFields state={paymentFields} total={checkoutOrder.totalAmount} venueId={checkoutOrder.venueId} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => setCheckoutOrder(null)}>
                  Annuler
                </Button>
                <Button type="submit" className="w-full" loading={updateOrder.isPending}>
                  Confirmer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
