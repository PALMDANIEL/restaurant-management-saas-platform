"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Smartphone, XCircle } from "lucide-react";

type Invoice = {
  id: number;
  orderId: number;
  amount: number;
  status: "pending" | "paid" | "failed" | "cancelled";
  paymentUrl: string | null;
  operator: string | null;
};

function formatFcfa(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

/**
 * Fenêtre de paiement LigdiCash : crée la facture, affiche le QR code que le client scanne
 * avec son téléphone (Orange Money, Moov Money), et suit le paiement jusqu'à confirmation.
 */
export function LigdicashCheckout({
  orderId,
  cashSessionId,
  creditNoteCode,
  onPaid,
  onClose,
}: {
  orderId: number;
  cashSessionId: number;
  creditNoteCode?: string;
  onPaid: (invoice: Invoice) => void;
  onClose: () => void;
}) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [closing, setClosing] = useState(false);
  const paidRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ligdicash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, cashSessionId, creditNoteCode }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (cancelled) return;
        setInvoice(json.invoice);
        if (json.invoice.paymentUrl) {
          setQr(await QRCode.toDataURL(json.invoice.paymentUrl, { margin: 1, width: 240 }));
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, cashSessionId, creditNoteCode, attempt]);

  const pending = invoice?.status === "pending";
  useEffect(() => {
    if (!pending || !invoice) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/ligdicash?id=${invoice.id}`);
        if (!res.ok) return;
        const json = await res.json();
        setInvoice(json.invoice);
      } catch {
        // Réseau coupé : on réessaie au prochain tour.
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [pending, invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (invoice?.status === "paid" && !paidRef.current) {
      paidRef.current = true;
      toast.success(`Paiement LigdiCash reçu (${formatFcfa(invoice.amount)})`);
      onPaid(invoice);
    }
  }, [invoice, onPaid]);

  function retry() {
    setInvoice(null);
    setQr(null);
    setError(null);
    setAttempt((n) => n + 1);
  }

  async function close() {
    if (invoice?.status === "pending") {
      setClosing(true);
      try {
        const res = await fetch(`/api/ligdicash?id=${invoice.id}`, { method: "DELETE" });
        const json = await res.json().catch(() => null);
        if (json?.invoice?.status === "paid") {
          setInvoice(json.invoice);
          return;
        }
      } finally {
        setClosing(false);
      }
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-card p-6 text-center shadow-xl pb-safe sm:rounded-2xl">
        <h3 className="font-display text-lg font-semibold">Paiement LigdiCash</h3>
        <p className="mt-1 text-xs text-muted-foreground">Commande #{orderId} · Orange Money, Moov Money</p>

        {error && (
          <div className="mt-5 space-y-3">
            <XCircle className="mx-auto h-10 w-10 text-red-500" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" onClick={retry}>
              Réessayer
            </Button>
          </div>
        )}

        {!error && !invoice && <p className="mt-6 text-sm text-muted-foreground">Création de la facture…</p>}

        {invoice && (
          <p className="mt-4 font-mono text-2xl font-bold tabular-nums">{formatFcfa(invoice.amount)}</p>
        )}

        {invoice?.status === "pending" && (
          <div className="mt-4 space-y-3">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code de paiement LigdiCash" className="mx-auto h-56 w-56 rounded-xl bg-white p-2" />
            )}
            <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <Smartphone className="h-4 w-4" /> Le client scanne le code avec son téléphone.
            </p>
            {invoice.paymentUrl && (
              <a
                href={invoice.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary-strong underline"
              >
                Ouvrir la page de paiement <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <p className="animate-pulse text-xs text-muted-foreground">En attente de la confirmation…</p>
          </div>
        )}

        {invoice?.status === "paid" && (
          <div className="mt-4 space-y-2">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="text-sm font-medium">Payé{invoice.operator ? ` par ${invoice.operator}` : ""}.</p>
          </div>
        )}

        {(invoice?.status === "failed" || invoice?.status === "cancelled") && (
          <div className="mt-4 space-y-3">
            <XCircle className="mx-auto h-10 w-10 text-red-500" />
            <p className="text-sm">Le paiement n&apos;a pas abouti.</p>
            <Button variant="outline" onClick={retry}>
              Nouvelle facture
            </Button>
          </div>
        )}

        <Button variant="outline" className="mt-5 w-full" loading={closing} onClick={close}>
          {invoice?.status === "paid" ? "Fermer" : "Annuler"}
        </Button>
      </div>
    </div>
  );
}
