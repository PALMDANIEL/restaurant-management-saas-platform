import { cn } from "@/lib/utils";
import { LucideIcon, ArrowUpRight, ArrowDownRight } from "lucide-react";

type Tone = "primary" | "accent" | "sun" | "neutral";

const toneStyles: Record<Tone, { icon: string; ring: string }> = {
  primary: { icon: "bg-primary/10 text-primary-strong", ring: "group-hover:ring-primary/20" },
  accent: { icon: "bg-accent/10 text-accent", ring: "group-hover:ring-accent/20" },
  sun: { icon: "bg-sun-soft text-sun", ring: "group-hover:ring-sun/20" },
  neutral: { icon: "bg-muted text-foreground/70", ring: "group-hover:ring-border" },
};

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "primary",
  trend,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: Tone;
  /** Positive or negative percentage change vs. previous period */
  trend?: number;
  className?: string;
}) {
  const t = toneStyles[tone];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(28,23,18,0.04)] ring-1 ring-transparent transition-all hover:-translate-y-0.5 hover:shadow-md",
        t.ring,
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", t.icon)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 font-display font-mono text-2xl font-bold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        {typeof trend === "number" && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold",
              trend >= 0 ? "text-accent" : "text-red-600"
            )}
          >
            {trend >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
