"use client";

import { useState } from "react";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type PaymentFieldsValue = {
  method: string;
  amountReceived: string;
  changeAction: "cash" | "credit_note";
  creditNoteCode: string;
  appliedCreditNote: { code: string; remainingAmount: number } | null;
};

function formatFcfa(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export function usePaymentFields(initialMethod = "cash") {
  const [method, setMethod] = useState(initialMethod);
  const [amountReceived, setAmountReceived] = useState("");
  const [changeAction, setChangeAction] = useState<"cash" | "credit_note">("cash");
  const [creditNoteCode, setCreditNoteCode] = useState("");
  const [appliedCreditNote, setAppliedCreditNote] = useState<{ code: string; remainingAmount: number } | null>(
    null
  );
  const [checkingCode, setCheckingCode] = useState(false);

  async function checkCreditNoteCode(venueId: number | undefined) {
    const code = creditNoteCode.trim();
    if (!code) return;
    setCheckingCode(true);
    try {
      const res = await fetch(`/api/credit-notes/lookup?code=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (venueId && json.creditNote.venueId !== venueId) {
        throw new Error("Cet avoir n'est pas valable dans ce point de vente.");
      }
      if (json.creditNote.status !== "active" || json.creditNote.remainingAmount <= 0) {
        throw new Error("Cet avoir n'est plus utilisable.");
      }
      setAppliedCreditNote({ code: json.creditNote.code, remainingAmount: json.creditNote.remainingAmount });
      toast.success(`Avoir ${json.creditNote.code} : ${formatFcfa(json.creditNote.remainingAmount)} disponible`);
    } catch (e) {
      setAppliedCreditNote(null);
      toast.error((e as Error).message);
    } finally {
      setCheckingCode(false);
    }
  }

  function clearCreditNote() {
    setAppliedCreditNote(null);
    setCreditNoteCode("");
  }

  function reset() {
    setMethod(initialMethod);
    setAmountReceived("");
    setChangeAction("cash");
    setCreditNoteCode("");
    setAppliedCreditNote(null);
  }

  return {
    method,
    setMethod,
    amountReceived,
    setAmountReceived,
    changeAction,
    setChangeAction,
    creditNoteCode,
    setCreditNoteCode,
    appliedCreditNote,
    checkingCode,
    checkCreditNoteCode,
    clearCreditNote,
    reset,
  };
}

export type PaymentFieldsState = ReturnType<typeof usePaymentFields>;

/**
 * Affiche les champs de paiement : avoir à utiliser, méthode, montant reçu (espèces) avec
 * calcul de la monnaie et choix "rendre en espèces" / "émettre un avoir" en cas de manque
 * de monnaie. `total` est le montant à payer avant application d'un éventuel avoir.
 */
export function PaymentFields({
  state,
  total,
  venueId,
}: {
  state: PaymentFieldsState;
  total: number;
  venueId: number | undefined;
}) {
  const remainingAfterNote = state.appliedCreditNote
    ? Math.max(0, total - state.appliedCreditNote.remainingAmount)
    : total;

  const received = Number(state.amountReceived || 0);
  const changeDue = state.method === "cash" && received > remainingAfterNote ? received - remainingAfterNote : 0;

  return (
    <div className="space-y-3">
      <div>
        <Label>Avoir à utiliser (optionnel)</Label>
        {state.appliedCreditNote ? (
          <div className="flex items-center justify-between rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
            <span className="font-medium">
              {state.appliedCreditNote.code} · {formatFcfa(state.appliedCreditNote.remainingAmount)}
            </span>
            <button type="button" onClick={state.clearCreditNote} className="text-xs text-muted-foreground underline">
              Retirer
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Code (ex: AV-XXXXXX)"
              value={state.creditNoteCode}
              onChange={(e) => state.setCreditNoteCode(e.target.value.toUpperCase())}
            />
            <Button
              type="button"
              variant="outline"
              loading={state.checkingCode}
              onClick={() => state.checkCreditNoteCode(venueId)}
            >
              Vérifier
            </Button>
          </div>
        )}
      </div>

      {remainingAfterNote > 0 && (
        <>
          <Select value={state.method} onChange={(e) => state.setMethod(e.target.value)}>
            <option value="cash">Espèces</option>
            <option value="card">Carte</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="ligdicash">LigdiCash (QR code Orange / Moov)</option>
            <option value="mixed">Paiement mixte</option>
          </Select>

          {state.method === "ligdicash" && (
            <p className="rounded-xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              Un QR code s&apos;affiche : le client le scanne et paie {formatFcfa(remainingAfterNote)} depuis son
              téléphone. La commande est réglée dès que LigdiCash confirme.
            </p>
          )}

          {state.method === "cash" && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <div>
                <Label>Montant reçu du client (FCFA)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder={String(remainingAfterNote)}
                  value={state.amountReceived}
                  onChange={(e) => state.setAmountReceived(e.target.value)}
                />
              </div>
              {changeDue > 0 && (
                <div className="space-y-2 rounded-lg bg-muted p-2.5">
                  <p className="text-sm">
                    Monnaie à rendre : <span className="font-semibold">{formatFcfa(changeDue)}</span>
                  </p>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => state.setChangeAction("cash")}
                      className={`flex-1 rounded-lg border px-2 py-1.5 ${
                        state.changeAction === "cash" ? "border-primary bg-primary/10 text-primary-strong" : "border-border"
                      }`}
                    >
                      Rendre en espèces
                    </button>
                    <button
                      type="button"
                      onClick={() => state.setChangeAction("credit_note")}
                      className={`flex-1 rounded-lg border px-2 py-1.5 ${
                        state.changeAction === "credit_note"
                          ? "border-primary bg-primary/10 text-primary-strong"
                          : "border-border"
                      }`}
                    >
                      Émettre un avoir
                    </button>
                  </div>
                  {state.changeAction === "credit_note" && (
                    <p className="text-xs text-muted-foreground">
                      Un avoir de {formatFcfa(changeDue)} sera généré pour le client (manque de monnaie).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {remainingAfterNote === 0 && (
        <p className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
          Entièrement couvert par l&apos;avoir.
        </p>
      )}
    </div>
  );
}

/** Construit le payload `immediatePayment` / champs PATCH à partir de l'état du formulaire. */
export function buildPaymentPayload(state: PaymentFieldsState, cashSessionId: number) {
  return {
    method: state.method as "cash" | "card" | "mobile_money" | "mixed" | "ligdicash",
    cashSessionId,
    amountReceived: state.amountReceived ? Number(state.amountReceived) : undefined,
    changeAction: state.changeAction,
    creditNoteCode: state.appliedCreditNote?.code,
  };
}
