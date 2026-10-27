import { cn } from "@/lib/utils";
import { formatNote, noteTone } from "./types";

/** Anneau de progression de la note sur 20. */
export function NoteRing({
  note,
  size = 64,
  provisional,
}: {
  note: number | null;
  size?: number;
  provisional?: boolean;
}) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const tone = noteTone(note);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        {note !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - note / 20)}
            className={cn("transition-[stroke-dashoffset] duration-700", tone.ring, provisional && "opacity-60")}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn("font-display text-lg font-bold tabular-nums", tone.text)}>
          {note === null ? "—" : formatNote(note)}
        </span>
        <span className="mt-0.5 text-[9px] font-medium text-muted-foreground">/20</span>
      </div>
    </div>
  );
}
