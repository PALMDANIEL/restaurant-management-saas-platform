"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { formatDate, PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { Printer, Loader2 } from "lucide-react";

type ReceiptItem = {
  id: number;
  quantity: string;
  unitPrice: number;
  observations: string | null;
  productName: string;
  unit: string;
};

type ReceiptPayment = {
  id: number;
  method: string;
  amount: number;
  amountReceived: number | null;
  changeGiven: number | null;
  createdAt: string;
  creditNoteIssued: { code: string; amount: number } | null;
  creditNoteRedeemed: { code: string; amount: number } | null;
};

type ReceiptData = {
  order: {
    id: number;
    status: string;
    totalAmount: number;
    createdAt: string;
    notes: string | null;
  };
  items: ReceiptItem[];
  venue: { name: string; address: string | null; phone: string | null } | null;
  company: { name: string; currency: string } | null;
  payments: ReceiptPayment[];
  server: { firstName: string; lastName: string } | null;
  cashier: { firstName: string; lastName: string } | null;
  table: { number: string } | null;
  customer: { name: string; phone: string | null } | null;
};

function formatFcfa(n: number, currency = "FCFA") {
  return `${n.toLocaleString("fr-FR")} ${currency}`;
}

export default function ReceiptPage() {
  const params = useParams<{ orderId: string }>();

  const { data, isLoading, error } = useQuery<ReceiptData>({
    queryKey: ["receipt", params.orderId],
    queryFn: async () => {
      const res = await fetch(`/api/receipts/${params.orderId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json;
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-red-600">
        {(error as Error)?.message || "Reçu introuvable."}
      </div>
    );
  }

  const currency = data.company?.currency === "XOF" || !data.company?.currency ? "FCFA" : data.company.currency;
  const cashPayment = data.payments.find((p) => p.method === "cash");
  const creditNoteIssued = data.payments.find((p) => p.creditNoteIssued)?.creditNoteIssued;
  const creditNotesRedeemed = data.payments.filter((p) => p.creditNoteRedeemed).map((p) => p.creditNoteRedeemed!);

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <style>{`
        @media print {
          @page { margin: 8mm; }
          body { background: white; }
        }
      `}</style>

      <div className="mx-auto flex max-w-[380px] justify-end px-2 pb-3 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm active:scale-[0.98]"
        >
          <Printer className="h-4 w-4" /> Imprimer
        </button>
      </div>

      <div className="mx-auto w-full max-w-[380px] rounded-2xl border border-border bg-white p-5 font-mono text-[13px] leading-relaxed text-neutral-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        {/* En-tête */}
        <div className="mb-3 text-center">
          <p className="font-display text-base font-bold tracking-tight">{data.company?.name ?? data.venue?.name}</p>
          {data.venue && <p className="text-xs">{data.venue.name}</p>}
          {data.venue?.address && <p className="text-xs text-neutral-600">{data.venue.address}</p>}
          {data.venue?.phone && <p className="text-xs text-neutral-600">Tél : {data.venue.phone}</p>}
        </div>

        <div className="border-t border-dashed border-neutral-300 pt-2" />

        {/* Métadonnées */}
        <div className="space-y-0.5 py-2 text-xs">
          <div className="flex justify-between">
            <span>Reçu N°</span>
            <span className="font-semibold">#{String(data.order.id).padStart(6, "0")}</span>
          </div>
          <div className="flex justify-between">
            <span>Date</span>
            <span>{formatDate(data.order.createdAt, true)}</span>
          </div>
          {data.table && (
            <div className="flex justify-between">
              <span>Table</span>
              <span>{data.table.number}</span>
            </div>
          )}
          {data.server && (
            <div className="flex justify-between">
              <span>Serveuse</span>
              <span>
                {data.server.firstName} {data.server.lastName}
              </span>
            </div>
          )}
          {data.cashier && (
            <div className="flex justify-between">
              <span>Caissier(ère)</span>
              <span>
                {data.cashier.firstName} {data.cashier.lastName}
              </span>
            </div>
          )}
          {data.customer && (
            <div className="flex justify-between">
              <span>Client</span>
              <span>{data.customer.name}</span>
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-neutral-300" />

        {/* Articles */}
        <div className="space-y-1.5 py-2">
          {data.items.map((it) => (
            <div key={it.id} className="text-xs">
              <div className="flex justify-between font-medium">
                <span className="truncate pr-2">{it.productName}</span>
                <span className="shrink-0 tabular-nums">
                  {formatFcfa(it.unitPrice * Number(it.quantity), currency)}
                </span>
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>
                  {it.quantity} {it.unit} × {formatFcfa(it.unitPrice, currency)}
                </span>
              </div>
              {it.observations && <p className="text-neutral-500 italic">{it.observations}</p>}
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-neutral-300" />

        {/* Total */}
        <div className="flex items-center justify-between py-2 text-base font-bold">
          <span>TOTAL</span>
          <span className="tabular-nums">{formatFcfa(data.order.totalAmount, currency)}</span>
        </div>

        <div className="border-t border-dashed border-neutral-300" />

        {/* Paiement */}
        <div className="space-y-0.5 py-2 text-xs">
          {data.payments.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span>{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
              <span className="tabular-nums">{formatFcfa(p.amount, currency)}</span>
            </div>
          ))}
          {cashPayment?.amountReceived != null && (
            <div className="flex justify-between text-neutral-500">
              <span>Reçu (espèces)</span>
              <span className="tabular-nums">{formatFcfa(cashPayment.amountReceived, currency)}</span>
            </div>
          )}
          {cashPayment?.changeGiven != null && cashPayment.changeGiven > 0 && (
            <div className="flex justify-between text-neutral-500">
              <span>Monnaie rendue</span>
              <span className="tabular-nums">{formatFcfa(cashPayment.changeGiven, currency)}</span>
            </div>
          )}
        </div>

        {creditNotesRedeemed.length > 0 && (
          <>
            <div className="border-t border-dashed border-neutral-300" />
            <div className="py-2 text-xs">
              <p className="mb-0.5 font-semibold">Avoir(s) utilisé(s)</p>
              {creditNotesRedeemed.map((n) => (
                <div key={n.code} className="flex justify-between text-neutral-600">
                  <span>{n.code}</span>
                  <span className="tabular-nums">-{formatFcfa(n.amount, currency)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {creditNoteIssued && (
          <>
            <div className="border-t border-dashed border-neutral-300" />
            <div className="py-2 text-xs">
              <p className="mb-0.5 font-semibold">Avoir émis (monnaie non disponible)</p>
              <div className="flex justify-between">
                <span>Code</span>
                <span className="font-bold tracking-wide">{creditNoteIssued.code}</span>
              </div>
              <div className="flex justify-between">
                <span>Montant</span>
                <span className="tabular-nums">{formatFcfa(creditNoteIssued.amount, currency)}</span>
              </div>
              <p className="mt-1 text-neutral-500">
                Conservez ce reçu : ce code est utilisable lors d&apos;un prochain passage pour un montant
                équivalent.
              </p>
            </div>
          </>
        )}

        <div className="border-t border-dashed border-neutral-300" />

        <p className="pt-3 text-center text-xs text-neutral-500">Merci de votre visite !</p>
      </div>
    </div>
  );
}
