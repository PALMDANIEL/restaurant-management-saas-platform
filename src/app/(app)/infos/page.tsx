"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellRing, MapPin, Megaphone, Pin, Plus, Trash2, Users } from "lucide-react";
import { useVenueParam } from "@/hooks/use-venue-query";
import { playMeetingBell } from "@/lib/meeting-bell";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";

type Shift = "jour" | "soir";
type Day = { date: string; status: Shift | "repos" | null; reason: string };
type Meeting = {
  id: number; title: string; notes: string | null; place: string | null; startsAt: string;
  remind2h: boolean; remind1h: boolean; groupIds: number[] | null;
};
type Info = { id: number; title: string; body: string; pinned: boolean; expiresAt: string | null; createdAt: string };
type Planning = {
  venue: { id: number; name: string } | null;
  manager: boolean;
  me: { id: number; firstName: string; shiftGroup: Shift | null; restDay: number | null } | null;
  group: { id: number; name: string } | null;
  mates: { id: number; firstName: string }[];
  groups?: { id: number; name: string }[];
  days: Day[];
  announcements: Info[];
  meetings: Meeting[];
};

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const STATUS = {
  jour: { icon: "☀️", label: "Matin", tone: "bg-sun-soft" },
  soir: { icon: "🌙", label: "Soir", tone: "bg-accent/15" },
  repos: { icon: "😴", label: "Repos", tone: "bg-muted" },
} as const;

const dayName = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const w = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return { w, label: `${w.slice(0, 3)}. ${d}` };
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

export default function InfosPage() {
  const venueParam = useVenueParam();
  const queryClient = useQueryClient();
  // Permission de notification lue côté navigateur seulement ("indisponible" pendant l'affichage serveur).
  const [, bump] = useState(0);
  const notifState = useSyncExternalStore(
    () => () => {},
    () => (typeof Notification === "undefined" ? "indisponible" : Notification.permission),
    () => "indisponible"
  );

  const venueQuery = venueParam !== "all" ? `?venueId=${venueParam}` : "";
  // Même clé que le hook de rappels (monté dans AppShell) quand aucun point de vente n'est choisi.
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
  const manager = !!data?.manager;
  const venueId = data?.venue?.id;
  const today = data?.days[0];

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
      toast.success("Réunion programmée");
      setM({ title: "", startsAt: "", place: "", notes: "", remind2h: true, remind1h: true, groupIds: [] });
      refresh();
    },
    onError,
  });
  const delMeeting = useMutation({ mutationFn: (id: number) => send(`/api/meetings?id=${id}`, "DELETE"), onSuccess: refresh, onError });

  const [info, setInfo] = useState({ title: "", body: "", pinned: false });
  const addInfo = useMutation({
    mutationFn: () => send("/api/announcements", "POST", { venueId, ...info }),
    onSuccess: () => { toast.success("Info publiée"); setInfo({ title: "", body: "", pinned: false }); refresh(); },
    onError,
  });
  const delInfo = useMutation({ mutationFn: (id: number) => send(`/api/announcements?id=${id}`, "DELETE"), onSuccess: refresh, onError });

  const askNotifications = async () => {
    if (typeof Notification === "undefined") return;
    await Notification.requestPermission();
    bump((n) => n + 1);
  };
  const groupName = (id: number) => data?.groups?.find((g) => g.id === id)?.name ?? `#${id}`;

  if (!isLoading && !data?.venue) {
    return <p className="text-sm text-muted-foreground">Aucun point de vente ne vous est rattaché.</p>;
  }

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <PageHeader
        eyebrow={data?.venue?.name ?? "Équipe de salle"}
        title="Infos & réunions"
        description="Votre groupe, vos prochains jours, les consignes et les réunions à venir."
      />

      {/* Mon groupe */}
      {!manager && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 font-display text-2xl font-bold text-primary-strong">
              {data?.group?.name ?? "–"}
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold">
                {data?.group ? `Groupe ${data.group.name}` : "Pas de groupe de rotation"}
              </p>
              <p className="text-sm text-muted-foreground">
                {today
                  ? today.status === "repos"
                    ? today.reason === "repos-hebdo" ? "Aujourd'hui : votre jour de repos 😴" : "Aujourd'hui : votre groupe se repose 😴"
                    : today.status
                      ? `Aujourd'hui : service du ${STATUS[today.status].label.toLowerCase()} ${STATUS[today.status].icon}`
                      : "Aujourd'hui : rien de prévu"
                  : "…"}
                {data?.me?.restDay != null && ` · repos chaque ${WEEKDAYS[data.me.restDay]}`}
              </p>
            </div>
          </div>
          {data?.mates && data.mates.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Dans votre groupe :</span>
              {data.mates.map((x) => (
                <span key={x.id} className={cn("rounded-full bg-muted px-2.5 py-0.5 text-xs", x.id === data.me?.id && "bg-primary/10 font-semibold text-primary-strong")}>
                  {x.firstName}{x.id === data.me?.id && " (vous)"}
                </span>
              ))}
            </p>
          )}
          <div className="mt-4 overflow-x-auto">
            <div className="flex min-w-max gap-1.5">
              {data?.days.map((d, i) => {
                const st = d.status ? STATUS[d.status] : null;
                const n = dayName(d.date);
                return (
                  <div key={d.date} className={cn("w-[3.6rem] rounded-xl border border-border p-1.5 text-center", st?.tone, i === 0 && "ring-2 ring-primary")}>
                    <p className="text-[10px] capitalize text-muted-foreground">{n.label}</p>
                    <p className="text-lg leading-tight">{st?.icon ?? "·"}</p>
                    <p className="text-[10px]">{st?.label ?? "—"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Réunions */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold"><BellRing className="h-4 w-4 text-primary" /> Réunions à venir</h2>
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
                    {manager && <span>· {x.groupIds ? `Groupe${x.groupIds.length > 1 ? "s" : ""} ${x.groupIds.map(groupName).join(", ")}` : "Toutes les serveuses"}</span>}
                  </p>
                </div>
                {manager && (
                  <button aria-label={`Supprimer la réunion ${x.title}`} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => confirm("Supprimer cette réunion ?") && delMeeting.mutate(x.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {!manager && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            <span className="flex-1">La sonnerie retentit tant que l&apos;application est ouverte. Touchez l&apos;écran au moins une fois pour autoriser le son.</span>
            <Button variant="outline" size="sm" onClick={() => playMeetingBell()}>🔔 Tester la sonnerie</Button>
            {notifState === "default" && <Button variant="outline" size="sm" onClick={askNotifications}>Autoriser les notifications</Button>}
          </div>
        )}

        {manager && (
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
              <span className="text-muted-foreground">Sonnerie de rappel :</span>
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
        )}
      </section>

      {/* Infos */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold"><Megaphone className="h-4 w-4 text-primary" /> Infos et consignes</h2>
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
                {manager && (
                  <button aria-label={`Supprimer l'info ${a.title}`} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => confirm("Supprimer cette info ?") && delInfo.mutate(a.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {manager && (
          <form className="space-y-3 rounded-xl border border-dashed border-border p-3" onSubmit={(e) => { e.preventDefault(); addInfo.mutate(); }}>
            <p className="text-sm font-semibold">Publier une info</p>
            <div><Label>Titre</Label><Input value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} required maxLength={150} /></div>
            <div><Label>Message</Label><Textarea value={info.body} onChange={(e) => setInfo({ ...info, body: e.target.value })} required rows={3} maxLength={4000} /></div>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={info.pinned} onChange={(e) => setInfo({ ...info, pinned: e.target.checked })} /> Épingler en haut</label>
            <Button type="submit" loading={addInfo.isPending}><Plus className="h-4 w-4" /> Publier</Button>
          </form>
        )}
      </section>

    </div>
  );
}
