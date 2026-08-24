"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { ScrollText } from "lucide-react";

type LogEntry = {
  id: number;
  userName: string;
  action: string;
  entity: string;
  entityId: number | null;
  createdAt: string;
};

const ACTION_CLASSES: Record<string, string> = {
  create: "border-emerald-300 bg-emerald-50 text-emerald-700",
  update: "border-sky-300 bg-sky-50 text-sky-700",
  update_status: "border-sky-300 bg-sky-50 text-sky-700",
  delete: "border-red-300 bg-red-50 text-red-700",
  deactivate: "border-red-300 bg-red-50 text-red-700",
  cancelled: "border-red-300 bg-red-50 text-red-700",
  open: "border-emerald-300 bg-emerald-50 text-emerald-700",
  close: "border-amber-300 bg-amber-50 text-amber-700",
  earn: "border-emerald-300 bg-emerald-50 text-emerald-700",
  redeem: "border-amber-300 bg-amber-50 text-amber-700",
};

const ENTITY_LABELS: Record<string, string> = {
  product: "Produit",
  order: "Commande",
  customer: "Client",
  loyalty: "Fidélité",
  cash_session: "Session de caisse",
  expense: "Dépense",
  supplier: "Fournisseur",
  supplier_order: "Commande fournisseur",
  reservation: "Réservation",
  table: "Table",
  user: "Utilisateur",
  venue: "Point de vente",
  company: "Entreprise",
  category: "Catégorie",
};

export default function AuditLogPage() {
  const venueParam = useVenueParam();
  const [entityFilter, setEntityFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", venueParam],
    queryFn: async () => (await fetch(`/api/audit-log?venueId=${venueParam}`)).json(),
  });
  const logs: LogEntry[] = useMemo(() => data?.logs ?? [], [data]);

  const entities = useMemo(() => [...new Set(logs.map((l) => l.entity))], [logs]);
  const filtered = useMemo(
    () => (entityFilter === "all" ? logs : logs.filter((l) => l.entity === entityFilter)),
    [logs, entityFilter]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journal d&apos;audit</h1>
          <p className="text-sm text-muted-foreground">Historique des actions effectuées sur la plateforme.</p>
        </div>
        <Select className="w-auto" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
          <option value="all">Toutes les entités</option>
          {entities.map((e) => (
            <option key={e} value={e}>
              {ENTITY_LABELS[e] ?? e}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} entrée(s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {filtered.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
              <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Badge className={ACTION_CLASSES[l.action] ?? "border-border bg-muted text-foreground"}>{l.action}</Badge>
              <span className="flex-1 truncate">
                <span className="font-medium">{l.userName}</span> · {ENTITY_LABELS[l.entity] ?? l.entity}
                {l.entityId ? ` #${l.entityId}` : ""}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(l.createdAt, true)}</span>
            </div>
          ))}
          {!isLoading && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucune entrée dans le journal.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
