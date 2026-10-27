"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-card p-6 shadow-xl pb-safe sm:rounded-2xl ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
