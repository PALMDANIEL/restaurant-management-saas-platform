"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
  ArrowLeft,
  Search,
  ShieldAlert,
  ShieldX,
  MessageCircle,
} from "lucide-react";
import { motion } from "framer-motion";

const DEMO_ACCOUNTS = [
  { role: "Super Admin", email: "superadmin@maquis.app" },
  { role: "Gérant", email: "gerant@maquis.app" },
  { role: "Manager", email: "manager@maquis.app" },
  { role: "Caissier", email: "caissier@maquis.app" },
  { role: "Serveuse", email: "serveuse@maquis.app" },
];

type Company = {
  id: number;
  name: string;
  logoUrl: string | null;
  accessible: boolean;
  reason: "suspended" | "expired" | null;
  message: string | null;
};

export default function LoginPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [companySearch, setCompanySearch] = useState("");

  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(companySearch.trim().toLowerCase())
  );

  const [email, setEmail] = useState("gerant@maquis.app");
  const [password, setPassword] = useState("password123");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/companies/public")
      .then((res) => res.json())
      .then((data) => {
        const list: Company[] = data.companies ?? [];
        setCompanies(list);
        if (list.length === 1 && list[0].accessible) setCompany(list[0]);
      })
      .catch(() => toast.error("Impossible de charger la liste des entreprises"))
      .finally(() => setLoadingCompanies(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, companyId: company.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Connexion impossible");
        return;
      }
      toast.success(`Bienvenue ${data.user.firstName} !`);
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#0a0a0b]">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-orange-600 via-orange-700 to-zinc-900 p-12 text-white lg:flex">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white,transparent_35%),radial-gradient(circle_at_80%_60%,white,transparent_30%)]" />
        <div className="relative z-10 flex items-center gap-2 text-lg font-semibold">
          <Image
            src="/dani-mak-logo.png"
            alt="Dani Mak"
            width={40}
            height={40}
            className="rounded-full"
            priority
          />
          Dani Mak
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 max-w-md"
        >
          <h1 className="text-4xl font-bold leading-tight">
            Gérez vos maquis, restaurants et bars comme une entreprise moderne.
          </h1>
          <p className="mt-4 text-orange-100">
            Ventes, stock, caisse, serveuses, finances et intelligence artificielle —
            tout, en temps réel, sur un seul tableau de bord.
          </p>
        </motion.div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-sm text-orange-100">
            <ShieldCheck className="h-4 w-4" /> Sécurisé · RBAC · Audit log · JWT
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-white/15 pt-5 text-orange-100/90">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white p-1">
              <Image
                src="/palm-logo.png"
                alt="Palm Corporation"
                width={32}
                height={32}
                className="object-contain"
              />
            </div>
            <div className="text-xs leading-snug">
              <p className="font-medium text-white">
                Tous droits réservés © Palm Corporation - Artificial Intelligence &amp; Technology
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-orange-100/80">
                <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                WhatsApp : +226 77419106 / +226 73630882 / +226 68538246
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col items-center justify-center bg-background p-8 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 lg:hidden flex items-center gap-2 text-lg font-semibold">
            <Image
              src="/dani-mak-logo.png"
              alt="Dani Mak"
              width={32}
              height={32}
              className="rounded-full"
            />
            Dani Mak
          </div>
          {!company ? (
            <>
              <h2 className="text-2xl font-bold">Quelle entreprise ?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sélectionne ton entreprise pour accéder à ton espace de gestion.
              </p>

              {!loadingCompanies && companies.length > 5 && (
                <div className="relative mt-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    placeholder="Rechercher une entreprise..."
                    className="pl-9"
                  />
                </div>
              )}

              <div className="mt-6 max-h-80 space-y-2 overflow-y-auto pr-1">
                {loadingCompanies && (
                  <p className="text-sm text-muted-foreground">Chargement...</p>
                )}
                {!loadingCompanies && companies.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucune entreprise trouvée.</p>
                )}
                {!loadingCompanies && companies.length > 0 && filteredCompanies.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Aucune entreprise ne correspond à &quot;{companySearch}&quot;.
                  </p>
                )}
                {filteredCompanies.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!c.accessible}
                    onClick={() => c.accessible && setCompany(c)}
                    title={c.message ?? undefined}
                    className={
                      c.accessible
                        ? "flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:border-primary hover:bg-muted/50"
                        : "flex w-full cursor-not-allowed items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-left opacity-60"
                    }
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{c.name}</span>
                      {!c.accessible && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          {c.reason === "suspended" ? (
                            <ShieldX className="h-3 w-3 shrink-0 text-destructive" />
                          ) : (
                            <ShieldAlert className="h-3 w-3 shrink-0 text-amber-600" />
                          )}
                          {c.message}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setCompany(null);
                  setCompanySearch("");
                }}
                className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Changer d&apos;entreprise
              </button>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                <Building2 className="h-4 w-4" /> {company.name}
              </div>
              <h2 className="text-2xl font-bold">Connexion</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Accédez à votre espace de gestion.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="email">Adresse email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@maquis.app"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">Mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" size="lg" loading={loading}>
                  Se connecter
                </Button>
              </form>

              <div className="mt-8 rounded-xl border border-border bg-muted/50 p-4">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Comptes de démonstration (mot de passe : password123)
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => {
                        setEmail(acc.email);
                        setPassword("password123");
                      }}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span className="font-medium">{acc.role}</span>
                      <span className="text-muted-foreground">{acc.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </motion.div>

        <div className="mt-10 flex items-center gap-2.5 border-t border-border pt-5 lg:hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-600 p-1">
            <Image
              src="/palm-logo.png"
              alt="Palm Corporation"
              width={24}
              height={24}
              className="rounded object-contain"
            />
          </div>
          <div className="text-[11px] leading-snug text-muted-foreground">
            <p className="font-medium text-foreground">
              Tout droit réservé Palm Corporation - Artificial Intelligence &amp; Technology
            </p>
            <p className="mt-0.5 flex items-center gap-1">
              <MessageCircle className="h-3 w-3 shrink-0" />
              WhatsApp : +226 77419106 / +226 73630882 / +226 68538246
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
