import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

type Tone = "neutral" | "primary" | "accent" | "sun" | "danger";

const tones: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/20 bg-primary/10 text-primary-strong",
  accent: "border-accent/20 bg-accent/10 text-accent",
  sun: "border-sun/25 bg-sun-soft text-sun",
  danger: "border-red-200 bg-red-50 text-red-700",
};

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone && tones[tone],
        className
      )}
      {...props}
    />
  );
}
