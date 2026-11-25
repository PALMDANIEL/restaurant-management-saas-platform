"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellRing, Eye, MapPin, Megaphone, Pin, Plus, Trash2 } from "lucide-react";
import { useVenueParam } from "@/hooks/use-venue-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";

type Meeting = {
  id: number; title: string; notes: string | null; place: string | null; startsAt: string;
  remind2h: boolean; remind1h: boolean; groupIds: number[] | null;
};
type Info = { id: number; title: string; body: string; pinned: boolean; expiresAt: string | null; createdAt: string };
type Planning = {
  venue: { id: number; name: string } | null;
  manager: boolean;
  groups?: { id: number; name: string }[];
  announcements: Info[];
  meetings: Meeting[];
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

async function send(url: string, method: string, payload?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Erreur");
  return body;
}

function reminderLabel(m: Meeting) {
  if (m.remind2h && m.remind1h) return "Sonnerie 2 h et 1 h avant";
  if (m.remind2h) return "Sonnerie 2 h avant";
  if (m.remind1h) return "Sonnerie 1 h avant";
  return "Sans sonnerie";
}

/** Page des responsables : on y programme les réunions et on y publie les infos. Les serveuses les voient dans « Infos & réunions ». */
export default function GererInfosPage() {
  const venueParam = useVenueParam();
  const queryClient = useQueryClient();

  const venueQuery = venueParam !== "all" ? `?venueId=${venueParam}` : "";
  const { data, isLoading } = useQuery<Planning>({
    queryKey: venueParam === "all" ? ["me-planning"] : ["me-planning", venueParam],
    queryFn: async () => {
      const res = await fetch(`/api/me/planning${venueQuery}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      return body;
    },
    refetchInterval: 60_000,
  });
  const venueId = data?.venue?.id;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["me-planning"] });
  const onError = (e: Error) => toast.error(e.message);

  const [m, setM] = useState({ title: "", startsAt: "", place: "", notes: "", remind2h: true, remind1h: true, groupIds: [] as number[] });
  const addMeeting = useMutation({
    mutationFn: () =>
      send("/api/meetings", "POST", {
        venueId, title: m.title, startsAt: new Date(m.startsAt).toISOString(), place: m.place || null,
        notes: m.notes || null, remind2h: m.remind2h, remind1h: m.remind1h, groupIds: m.groupIds.length ? m.groupIds : null,
      }),
    onSuccess: () => {
      toast.success("Réunion programmée : les serveuses la voient dans « Infos & réunions »");
      setM({ title: "", startsAt: "", place: "", notes: "", remind2h: true, remind1h: true, groupIds: [] });
      refresh();
    },
    onError,
  });
  const delMeeting = useMutation({ mutationFn: (id: number) => send(`/api/meetings?id=${id}`, "DELETE"), onSuccess: refresh, onError });

  const [info, setInfo] = useState({ title: "", body: "", pinned: false });
  const addInfo = useMutation({
    mutationFn: () => send("/api/announcements", "POST", { venueId, ...info }),
    onSuccess: () => { toast.success("Info publiée : les serveuses la voient dans « Infos & réunions »"); setInfo({ title: "", body: "", pinned: false }); refresh(); },
    onError,
  });
  const delInfo = useMutation({ mutationFn: (id: number) => send(`/api/announcements?id=${id}`, "DELETE"), onSuccess: refresh, onError });

  const groupName = (id: number) => data?.groups?.find((g) => g.id === id)?.name ?? `#${id}`;

  if (!isLoading && !data?.venue) {
    return <p className="text-sm text-muted-foreground">Aucun point de vente ne vous est rattaché.</p>;
  }
  if (!isLoading && data && !data.manager) {
    return <p className="text-sm text-muted-foreground">Cette page est réservée aux responsables.</p>;
  }

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <PageHeader
        eyebrow={data?.venue?.name ?? "Équipe de salle"}
        title="Gérer les infos et réunions"
        description="Programmez ici les réunions et publiez les consignes. Les serveuses les voient dans leur écran « Infos & réunions », avec la sonnerie de rappel."
        actions={
          <Link
            href="/infos"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted sm:px-4"
          >
            <Eye className="h-4 w-4" /> Voir comme une serveuse
          </Link>
        }
      />

      {/* Réunions */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold"><BellRing className="h-4 w-4 text-primary" /> Réunions</h2>

        <form
          className="space-y-3 rounded-xl border border-dashed border-border p-3"
          onSubmit={(e) => { e.preventDefault(); addMeeting.mutate(); }}
        >
          <p className="text-sm font-semibold">Programmer une réunion</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Titre</Label><Input value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} required maxLength={150} /></div>
            <div><Label>Date et heure</Label><Input type="datetime-local" value={m.startsAt} onChange={(e) => setM({ ...m, startsAt: e.target.value })} required /></div>
            <div><Label>Lieu (facultatif)</Label><Input value={m.place} onChange={(e) => setM({ ...m, place: e.target.value })} maxLength={150} /></div>
            <div><Label>Notes (facultatif)</Label><Input value={m.notes} onChange={(e) => setM({ ...m, notes: e.target.value })} maxLength={2000} /></div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted-foreground">Sonnerie de rappel chez les serveuses :</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={m.remind2h} onChange={(e) => setM({ ...m, remind2h: e.target.checked })} /> 2 h avant</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={m.remind1h} onChange={(e) => setM({ ...m, remind1h: e.target.checked })} /> 1 h avant</label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Pour :</span>
            <span className="text-xs text-muted-foreground">{m.groupIds.length === 0 ? "toutes les serveuses" : "les groupes cochés"}</span>
            {data?.groups?.map((g) => (
              <label key={g.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={m.groupIds.includes(g.id)}
                  onChange={(e) => setM({ ...m, groupIds: e.target.checked ? [...m.groupIds, g.id] : m.groupIds.filter((x) => x !== g.id) })}
                />
                Groupe {g.name}
              </label>
            ))}
          </div>
          <Button type="submit" loading={addMeeting.isPending}><Plus className="h-4 w-4" /> Programmer</Button>
        </form>

        {data?.meetings.length === 0 && <p className="text-sm text-muted-foreground">Aucune réunion programmée.</p>}
        <ul className="space-y-2">
          {data?.meetings.map((x) => (
            <li key={x.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{x.title}</p>
                  <p className="text-sm capitalize text-muted-foreground">{when(x.startsAt)}</p>
                  {x.place && <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {x.place}</p>}
                  {x.notes && <p className="mt-1.5 whitespace-pre-wrap text-sm">{x.notes}</p>}
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Bell className="h-3.5 w-3.5" /> {reminderLabel(x)}
                    <span>· {x.groupIds ? `Groupe${x.groupIds.length > 1 ? "s" : ""} ${x.groupIds.map(groupName).join(", ")}` : "Toutes les serveuses"}</span>
                  </p>
                </div>
                <button aria-label={`Supprimer la réunion ${x.title}`} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => confirm("Supprimer cette réunion ?") && delMeeting.mutate(x.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Infos */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold"><Megaphone className="h-4 w-4 text-primary" /> Infos et consignes</h2>

        <form className="space-y-3 rounded-xl border border-dashed border-border p-3" onSubmit={(e) => { e.preventDefault(); addInfo.mutate(); }}>
          <p className="text-sm font-semibold">Publier une info</p>
          <div><Label>Titre</Label><Input value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} required maxLength={150} /></div>
          <div><Label>Message</Label><Textarea value={info.body} onChange={(e) => setInfo({ ...info, body: e.target.value })} required rows={3} maxLength={4000} /></div>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={info.pinned} onChange={(e) => setInfo({ ...info, pinned: e.target.checked })} /> Épingler en haut</label>
          <Button type="submit" loading={addInfo.isPending}><Plus className="h-4 w-4" /> Publier</Button>
        </form>

        {data?.announcements.length === 0 && <p className="text-sm text-muted-foreground">Aucune info pour le moment.</p>}
        <ul className="space-y-2">
          {data?.announcements.map((a) => (
            <li key={a.id} className={cn("rounded-xl border border-border p-3", a.pinned && "border-primary/40 bg-primary/5")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold">{a.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}{a.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</p>
                </div>
                <button aria-label={`Supprimer l'info ${a.title}`} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => confirm("Supprimer cette info ?") && delInfo.mutate(a.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
