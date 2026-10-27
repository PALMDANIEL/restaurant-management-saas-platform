import { CheckCircle2, XCircle } from "lucide-react";

/** Page où LigdiCash renvoie le client (sur son téléphone) après le paiement. */
export default async function PaiementPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const { statut } = await searchParams;
  const cancelled = statut === "annule";
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6 text-stone-900">
      <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        {cancelled ? (
          <XCircle className="mx-auto h-12 w-12 text-stone-400" />
        ) : (
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        )}
        <h1 className="mt-4 text-xl font-semibold">{cancelled ? "Paiement annulé" : "Merci !"}</h1>
        <p className="mt-2 text-sm text-stone-500">
          {cancelled
            ? "Aucun montant n'a été prélevé. Vous pouvez régler autrement à la caisse."
            : "Votre paiement a été transmis. La caisse le voit s'afficher dès que LigdiCash l'a confirmé. Vous pouvez fermer cette page."}
        </p>
      </div>
    </main>
  );
}
