// Essai de bout en bout de l'application (ventes, avoirs, LigdiCash, serveuses, droits par rôle).
// ⚠️ Écrit dans la base : uniquement sur une base d'essai remplie par `npm run seed`.
// Préparer : LIGDICASH_URL=http://localhost:3199/pay/v01/ dans .env, puis lancer dans deux terminaux
//   node scripts/essais/faux-ligdicash.mjs
//   npx next dev -p 3100
// Lancer : node scripts/essais/parcours.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const projet = process.argv[2] || process.cwd();
const require = createRequire(path.join(projet, "package.json"));
const { Client } = require("pg");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(projet, ".env"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
if (!/essai|test/i.test(new URL(env.DATABASE_URL).pathname)) {
  console.error("Refusé : le nom de la base doit contenir « essai » ou « test » (ce parcours écrit dans la base).");
  process.exit(2);
}
const pg = new Client({ connectionString: env.DATABASE_URL });
await pg.connect();
const q = async (sql, params) => (await pg.query(sql, params)).rows;

const BASE = "http://localhost:3100";
const FAUX = "http://localhost:3199";
let ok = 0;
let ko = 0;
const echecs = [];
function verifie(nom, condition, detail) {
  if (condition) {
    ok++;
    console.log(`  ✓ ${nom}`);
  } else {
    ko++;
    echecs.push(nom);
    console.log(`  ✗ ${nom}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ""}`);
  }
}
const titre = (t) => console.log(`\n■ ${t}`);

async function session(email, password = "password123") {
  const companies = await fetch(`${BASE}/api/companies/public`).then((r) => r.json());
  const company = (companies.companies ?? companies).find((c) => /Bon Coin/.test(c.name));
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `essai-${email}` },
    body: JSON.stringify({ email, password, companyId: company.id }),
  });
  const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
  const call = async (method, url, body) => {
    const r = await fetch(`${BASE}${url}`, {
      method,
      headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await r.json().catch(() => null);
    return { status: r.status, ...json };
  };
  return { status: res.status, call, cookie };
}

// ───────────────────────── Connexion et rôles
titre("Connexion");
const roles = {};
for (const [nom, email] of [
  ["proprietaire", "superadmin@maquis.app"],
  ["gerant", "gerant@maquis.app"],
  ["manager", "manager@maquis.app"],
  ["caissier", "caissier@maquis.app"],
  ["serveuse", "serveuse@maquis.app"],
]) {
  roles[nom] = await session(email);
  verifie(`connexion ${nom}`, roles[nom].status === 200 && roles[nom].cookie, roles[nom].status);
}
const mauvais = await session("gerant@maquis.app", "mauvais-mot-de-passe");
verifie("mauvais mot de passe refusé", mauvais.status === 401, mauvais.status);
const sansSession = await fetch(`${BASE}/api/orders`).then((r) => r.status);
verifie("API refusée sans connexion", sansSession === 401, sansSession);

const { proprietaire, gerant, manager, caissier, serveuse } = Object.fromEntries(
  Object.entries(roles).map(([k, v]) => [k, v.call])
);
const venue =
  (await caissier("GET", "/api/venues")).venues?.[0] ??
  (
    await q(
      "select v.id from venues v join user_venues uv on uv.venue_id=v.id join users u on u.id=uv.user_id where u.email='caissier@maquis.app' limit 1"
    )
  )[0];
const venueId = venue.id;
console.log(`  (point de vente ${venueId})`);

// ───────────────────────── Caisse
titre("Caisse");
let caisse = (await caissier("GET", `/api/cash-sessions?venueId=${venueId}`)).sessions?.find(
  (s) => s.status === "open"
);
if (!caisse) {
  const r = await caissier("POST", "/api/cash-sessions", { venueId, openingAmount: 20000 });
  verifie("ouverture de caisse", r.status === 201, r);
  caisse = r.session;
} else verifie("caisse déjà ouverte réutilisée", true);
const serveuseRefus = await serveuse("POST", "/api/cash-sessions", { venueId, openingAmount: 0 });
verifie("une serveuse ne peut pas ouvrir la caisse", serveuseRefus.status === 403, serveuseRefus.status);

const produits = (await caissier("GET", `/api/products?venueId=${venueId}`)).products.filter(
  (p) => p.active && Number(p.stockQuantity) > 10
);
const [p1, p2] = produits;
verifie("produits disponibles", !!p1 && !!p2, produits.length);
const stock = async (id) =>
  Number((await q("select stock_quantity from products where id=$1", [id]))[0].stock_quantity);

// ───────────────────────── Vente immédiate en espèces, monnaie en avoir
titre("Point de vente : espèces avec avoir pour la monnaie");
const stockAvant = await stock(p1.id);
const total1 = p1.price * 2;
const vente1 = await caissier("POST", "/api/orders", {
  venueId,
  items: [{ productId: p1.id, quantity: 2 }],
  immediatePayment: {
    method: "cash",
    cashSessionId: caisse.id,
    amountReceived: total1 + 700,
    changeAction: "credit_note",
  },
});
verifie("vente encaissée", vente1.status === 201 && vente1.order?.status === "paid", vente1);
verifie("avoir émis pour la monnaie (700 F)", vente1.creditNoteIssued?.amount === 700, vente1.creditNoteIssued);
verifie("stock diminué de 2", (await stock(p1.id)) === stockAvant - 2, {
  avant: stockAvant,
  apres: await stock(p1.id),
});
const recu1 = await caissier("GET", `/api/receipts/${vente1.order.id}`);
verifie("reçu disponible", recu1.status === 200, recu1.status);

// ───────────────────────── Commande cuisine puis encaissement par carte + avoir
titre("Commandes : cuisine → servie → encaissée avec l'avoir");
const cmd = await serveuse("POST", "/api/orders", { venueId, items: [{ productId: p2.id, quantity: 1 }] });
verifie("commande créée par la serveuse", cmd.status === 201 && cmd.order.status === "new", cmd);
for (const statut of ["preparing", "served"]) {
  const r = await serveuse("PATCH", "/api/orders", { id: cmd.order.id, status: statut });
  verifie(`statut ${statut}`, r.status === 200 && r.order?.status === statut, r);
}
const paye = await caissier("PATCH", "/api/orders", {
  id: cmd.order.id,
  status: "paid",
  paymentMethod: "card",
  cashSessionId: caisse.id,
  creditNoteCode: vente1.creditNoteIssued.code,
});
verifie("encaissement carte + avoir", paye.status === 200 && paye.order?.status === "paid", paye);
const lignes = await q("select method, amount from payments where order_id=$1 order by id", [cmd.order.id]);
verifie(
  "deux lignes de paiement : avoir 700 + carte le reste",
  lignes.length === 2 &&
    lignes[0].method === "credit_note" &&
    lignes[0].amount === 700 &&
    lignes[1].amount === p2.price - 700,
  lignes
);
const reutilise = await caissier("POST", "/api/orders", {
  venueId,
  items: [{ productId: p2.id, quantity: 1 }],
  immediatePayment: { method: "cash", cashSessionId: caisse.id, creditNoteCode: vente1.creditNoteIssued.code },
});
verifie("un avoir épuisé est refusé", reutilise.status >= 400, reutilise);

// ───────────────────────── Fidélité
titre("Fidélité : 1 point par 500 FCFA");
const client = (await q("select c.id, c.loyalty_points from customers c where c.venue_id=$1 limit 1", [venueId]))[0];
const venteClient = await caissier("POST", "/api/orders", {
  venueId,
  customerId: client.id,
  items: [{ productId: p2.id, quantity: 1 }],
  immediatePayment: { method: "card", cashSessionId: caisse.id },
});
const pointsApres = (await q("select loyalty_points from customers where id=$1", [client.id]))[0].loyalty_points;
verifie(
  `points gagnés = ${Math.floor(p2.price / 500)} pour ${p2.price} F`,
  pointsApres - client.loyalty_points === Math.floor(p2.price / 500),
  { avant: client.loyalty_points, apres: pointsApres, statut: venteClient.status }
);

// ───────────────────────── Annulation
titre("Annulation : le stock revient");
const s2 = await stock(p2.id);
const aAnnuler = await serveuse("POST", "/api/orders", { venueId, items: [{ productId: p2.id, quantity: 3 }] });
const annule = await manager("PATCH", "/api/orders", { id: aAnnuler.order.id, status: "cancelled" });
verifie("commande annulée", annule.order?.status === "cancelled", annule);
verifie("stock restauré", (await stock(p2.id)) === s2, { avant: s2, apres: await stock(p2.id) });

// ───────────────────────── LigdiCash : droits et configuration
titre("LigdiCash : réglages réservés au propriétaire");
verifie("caissier : réglages refusés", (await caissier("GET", "/api/payment-settings")).status === 403);
verifie(
  "gérant : réglages refusés",
  (await gerant("PUT", "/api/payment-settings", { apiKey: "x", authToken: "y" })).status === 403
);
await proprietaire("PUT", "/api/payment-settings", { remove: true });
const nonConfig = await serveuse("POST", "/api/orders", { venueId, items: [{ productId: p1.id, quantity: 1 }] });
const refusNonConfig = await caissier("POST", "/api/ligdicash", {
  orderId: nonConfig.order.id,
  cashSessionId: caisse.id,
});
verifie(
  "paiement refusé tant que LigdiCash n'est pas configuré",
  refusNonConfig.status === 400 && /configur/.test(refusNonConfig.error),
  refusNonConfig
);

const mauvaiseCle = await proprietaire("PUT", "/api/payment-settings", {
  apiKey: "CLE-FAUSSE",
  authToken: "JETON-ESSAI",
  live: false,
});
verifie(
  "clés enregistrées, seule la fin est montrée",
  mauvaiseCle.ligdicash?.configured &&
    mauvaiseCle.ligdicash.apiKeyHint === "…USSE" &&
    !JSON.stringify(mauvaiseCle).includes("JETON"),
  mauvaiseCle
);
const refusCle = await caissier("POST", "/api/ligdicash", { orderId: nonConfig.order.id, cashSessionId: caisse.id });
verifie(
  "clé refusée par LigdiCash : message clair",
  refusCle.status >= 400 && /refusé/.test(refusCle.error ?? ""),
  refusCle
);

await proprietaire("PUT", "/api/payment-settings", { apiKey: "CLE-ESSAI" });
const garde = await proprietaire("GET", "/api/payment-settings");
verifie("jeton conservé quand le champ est laissé vide", garde.ligdicash?.configured === true, garde);

const recu = await caissier("GET", `/api/receipts/${vente1.order.id}`);
verifie(
  "le reçu ne contient pas les clés",
  !JSON.stringify(recu).includes("CLE-ESSAI") && !JSON.stringify(recu).includes("JETON-ESSAI")
);
verifie("le reçu dit que LigdiCash est configuré (sans clé)", recu.company?.ligdicashConfigured === true, recu.company);

// ───────────────────────── LigdiCash : paiement complet
titre("LigdiCash : paiement par QR code");
const faux = (u) => fetch(`${FAUX}${u}`).then((r) => r.json());
const facture = await caissier("POST", "/api/ligdicash", { orderId: nonConfig.order.id, cashSessionId: caisse.id });
verifie(
  "facture créée avec lien de paiement",
  facture.status === 201 && facture.invoice?.paymentUrl?.includes("/payer/"),
  facture
);
const etat = await faux("/_etat");
const appel = etat.calls.find((c) => c.path.endsWith("/create") && c.apikey === "CLE-ESSAI");
verifie("LigdiCash appelé avec la clé et le jeton du restaurant", appel?.auth === "Bearer JETON-ESSAI", appel);
const envoye = etat.invoices.at(-1)[1].cmd;
verifie(
  "montant et liens envoyés",
  envoye.invoice.total_amount === p1.price && envoye.actions.callback_url.endsWith("/api/public/ligdicash/callback"),
  envoye
);

const attente = await caissier("GET", `/api/ligdicash?id=${facture.invoice.id}`);
verifie("tant que le client n'a pas payé : en attente", attente.invoice?.status === "pending", attente);
const token = etat.invoices.at(-1)[0];
await fetch(`${FAUX}/_payer?token=${token}`);
const rappel = await fetch(`${BASE}/api/public/ligdicash/callback`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token }),
});
verifie("rappel de LigdiCash accepté (sans connexion)", rappel.status === 200, rappel.status);
const rappel2 = await fetch(`${BASE}/api/public/ligdicash/callback`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `token=${token}`,
});
verifie("second rappel (format formulaire) sans effet", rappel2.status === 200);
const apres = await caissier("GET", `/api/ligdicash?id=${facture.invoice.id}`);
verifie(
  "facture payée, opérateur connu",
  apres.invoice?.status === "paid" && apres.invoice.operator === "Orange Money",
  apres
);
const commandePayee = (await q("select status from orders where id=$1", [nonConfig.order.id]))[0];
verifie("commande réglée", commandePayee.status === "paid", commandePayee);
const paiementsLigdi = await q("select method, amount from payments where order_id=$1", [nonConfig.order.id]);
verifie(
  "une seule ligne de paiement LigdiCash malgré deux rappels",
  paiementsLigdi.length === 1 && paiementsLigdi[0].method === "ligdicash",
  paiementsLigdi
);
const faux_rappel = await fetch(`${BASE}/api/public/ligdicash/callback`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: "inventé" }),
});
verifie("rappel avec jeton inconnu rejeté", faux_rappel.status === 404, faux_rappel.status);
const deja = await caissier("POST", "/api/ligdicash", { orderId: nonConfig.order.id, cashSessionId: caisse.id });
verifie("pas de nouvelle facture pour une commande réglée", deja.status === 400, deja);

titre("LigdiCash : cas délicats");
// Avoir + LigdiCash : seul le reste est demandé.
const avoirCmd = await caissier("POST", "/api/orders", {
  venueId,
  items: [{ productId: p1.id, quantity: 1 }],
  immediatePayment: {
    method: "cash",
    cashSessionId: caisse.id,
    amountReceived: p1.price + 500,
    changeAction: "credit_note",
  },
});
const cmd3 = await serveuse("POST", "/api/orders", { venueId, items: [{ productId: p2.id, quantity: 1 }] });
const f3 = await caissier("POST", "/api/ligdicash", {
  orderId: cmd3.order.id,
  cashSessionId: caisse.id,
  creditNoteCode: avoirCmd.creditNoteIssued.code,
});
verifie("avec un avoir de 500 F, LigdiCash ne demande que le reste", f3.invoice?.amount === p2.price - 500, f3);
const t3 = (await faux("/_etat")).invoices.at(-1)[0];
await fetch(`${FAUX}/_payer?token=${t3}`);
await caissier("GET", `/api/ligdicash?id=${f3.invoice.id}`);
const l3 = await q("select method, amount from payments where order_id=$1 order by id", [cmd3.order.id]);
verifie(
  "avoir puis LigdiCash, total juste",
  l3.length === 2 &&
    l3[0].method === "credit_note" &&
    l3[1].method === "ligdicash" &&
    l3[0].amount + l3[1].amount === p2.price,
  l3
);

// Abandon à la caisse, réglé en espèces, puis le client paie quand même : alerte de remboursement.
const cmd4 = await serveuse("POST", "/api/orders", { venueId, items: [{ productId: p1.id, quantity: 1 }] });
const f4 = await caissier("POST", "/api/ligdicash", { orderId: cmd4.order.id, cashSessionId: caisse.id });
const t4 = (await faux("/_etat")).invoices.at(-1)[0];
const abandon = await caissier("DELETE", `/api/ligdicash?id=${f4.invoice.id}`);
verifie("abandon à la caisse", abandon.invoice?.status === "cancelled", abandon);
await caissier("PATCH", "/api/orders", {
  id: cmd4.order.id,
  status: "paid",
  paymentMethod: "cash",
  cashSessionId: caisse.id,
});
await fetch(`${FAUX}/_payer?token=${t4}`);
await fetch(`${BASE}/api/public/ligdicash/callback`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: t4 }),
});
const l4 = await q("select method from payments where order_id=$1", [cmd4.order.id]);
verifie("pas de double encaissement", l4.length === 1 && l4[0].method === "cash", l4);
const alerte = await q("select title, message from notifications where message like $1 order by id desc limit 1", [
  `Commande #${cmd4.order.id}%`,
]);
verifie("alerte « paiement en trop, à rembourser »", alerte[0]?.title === "Paiement LigdiCash en trop", alerte);

// Paiement refusé par l'opérateur.
const cmd5 = await serveuse("POST", "/api/orders", { venueId, items: [{ productId: p1.id, quantity: 1 }] });
const f5 = await caissier("POST", "/api/ligdicash", { orderId: cmd5.order.id, cashSessionId: caisse.id });
const t5 = (await faux("/_etat")).invoices.at(-1)[0];
await fetch(`${FAUX}/_payer?token=${t5}&etat=nocompleted`);
const r5 = await caissier("GET", `/api/ligdicash?id=${f5.invoice.id}`);
verifie(
  "paiement refusé : facture en échec, commande non réglée",
  r5.invoice?.status === "failed" &&
    (await q("select status from orders where id=$1", [cmd5.order.id]))[0].status === "new",
  r5
);

// Montant reçu inférieur : on n'encaisse pas.
const f6 = await caissier("POST", "/api/ligdicash", { orderId: cmd5.order.id, cashSessionId: caisse.id });
const t6 = (await faux("/_etat")).invoices.at(-1)[0];
await fetch(`${FAUX}/_payer?token=${t6}&montant=10`);
const r6 = await caissier("GET", `/api/ligdicash?id=${f6.invoice.id}`);
verifie(
  "montant reçu trop faible : pas encaissé",
  r6.invoice?.status === "pending" &&
    (await q("select count(*)::int n from payments where order_id=$1", [cmd5.order.id]))[0].n === 0,
  r6
);

const autre = await serveuse("GET", `/api/ligdicash?id=${f6.invoice.id}`);
verifie("une serveuse peut suivre un paiement de son point de vente", autre.status === 200, autre.status);

// ───────────────────────── Serveuses : droits
titre("Serveuses : droits par rôle");
const awa = (await q("select id from users where email='serveuse@maquis.app'"))[0].id;
const mariam = (await q("select id from users where email='serveuse2@maquis.app'"))[0].id;
const today = (await gerant("GET", `/api/staff-performance?venueId=${venueId}`)).today;
verifie("journée en cours connue", /^\d{4}-\d{2}-\d{2}$/.test(today), today);
await q("delete from attendance_records where work_date=$1 and user_id in ($2,$3)", [today, awa, mariam]);
await q("delete from staff_behavior_ratings where work_date=$1", [today]);

const moi = await serveuse("POST", "/api/attendance", { venueId });
verifie("une serveuse pointe sa propre arrivée", moi.status === 201, moi);
const pourAutre = await serveuse("POST", "/api/attendance", { venueId, userId: mariam });
verifie("…mais pas celle d'une collègue", pourAutre.status === 403, pourAutre.status);
const double = await serveuse("POST", "/api/attendance", { venueId });
verifie("double arrivée refusée", double.status === 400, double);
verifie(
  "une serveuse ne note pas le comportement",
  (await serveuse("PUT", "/api/staff-ratings", { venueId, userId: mariam, workDate: today, scores: {} })).status === 403
);
verifie(
  "une serveuse voit son historique",
  (await serveuse("GET", `/api/staff-performance/history?venueId=${venueId}&userId=${awa}`)).status === 200
);
verifie(
  "…mais pas celui d'une collègue",
  (await serveuse("GET", `/api/staff-performance/history?venueId=${venueId}&userId=${mariam}`)).status === 403
);
verifie(
  "une serveuse ne voit pas les règles",
  (await serveuse("GET", `/api/staff-scoring-rules?venueId=${venueId}`)).status === 403
);
const regleManager = await manager("GET", `/api/staff-scoring-rules?venueId=${venueId}`);
verifie(
  "le manager voit les règles sans pouvoir les changer",
  regleManager.status === 200 && regleManager.canEdit === false,
  regleManager
);
verifie(
  "…et l'enregistrement lui est refusé",
  (await manager("PUT", "/api/staff-scoring-rules", { venueId, rules: regleManager.rules })).status === 403
);

// ───────────────────────── Serveuses : pointage et corrections
titre("Serveuses : pointage, corrections");
const ouvert = moi.record;
const sansMotif = await manager("PATCH", "/api/attendance", {
  id: ouvert.id,
  clockIn: new Date(Date.now() - 3600e3).toISOString(),
});
verifie("correction sans motif refusée", sansMotif.status === 400, sansMotif);
const futur = await manager("PATCH", "/api/attendance", {
  id: ouvert.id,
  clockOut: new Date(Date.now() + 3600e3).toISOString(),
  correctionNote: "essai",
});
verifie("départ dans le futur refusé", futur.status === 400, futur);
const corrige = await manager("PATCH", "/api/attendance", {
  id: ouvert.id,
  clockIn: new Date(Date.now() - 2 * 3600e3).toISOString(),
  correctionNote: "Arrivée vue par le manager",
});
verifie("correction avec motif acceptée", corrige.status === 200 && corrige.record.correctedBy, corrige);
const auditCorr = await q(
  "select details from audit_logs where action='correct' and entity_id=$1 order by id desc limit 1",
  [ouvert.id]
);
verifie(
  "correction tracée dans le journal d'audit (avant / après)",
  !!auditCorr[0]?.details?.before && !!auditCorr[0]?.details?.after,
  auditCorr
);
const depart = await serveuse("PATCH", "/api/attendance", { id: ouvert.id });
verifie("départ pointé", depart.status === 200 && depart.record.clockOut, depart);
const oubli = await gerant("POST", "/api/attendance", {
  venueId,
  userId: mariam,
  clockIn: new Date(Date.now() - 5 * 3600e3).toISOString(),
  clockOut: new Date(Date.now() - 3600e3).toISOString(),
  correctionNote: "Pointage oublié",
});
verifie(
  "pointage oublié saisi par le gérant",
  oubli.status === 201 && oubli.record.correctionNote === "Pointage oublié",
  oubli
);

// ───────────────────────── Serveuses : notation
titre("Serveuses : fiche de comportement et note du jour");
const incomplet = await manager("PUT", "/api/staff-ratings", {
  venueId,
  userId: awa,
  workDate: today,
  scores: { courtesy: 5 },
});
verifie(
  "fiche incomplète refusée avec la liste des critères manquants",
  incomplet.status === 400 && /Tenue/.test(incomplet.error),
  incomplet
);
const horsBorne = await manager("PUT", "/api/staff-ratings", {
  venueId,
  userId: awa,
  workDate: today,
  scores: { courtesy: 9 },
});
verifie("note hors de 1 à 5 refusée", horsBorne.status === 400, horsBorne.status);
const fiche = await manager("PUT", "/api/staff-ratings", {
  venueId,
  userId: awa,
  workDate: today,
  scores: { courtesy: 5, appearance: 5, teamwork: 4, rigor: 4, responsiveness: 5, inconnu: 1 },
  comment: "Essai",
});
verifie("fiche complète enregistrée", fiche.status === 200, fiche);
verifie("critère inconnu ignoré", fiche.rating && !("inconnu" in fiche.rating.scores), fiche.rating?.scores);
const reecrit = await manager("PUT", "/api/staff-ratings", {
  venueId,
  userId: awa,
  workDate: today,
  scores: { courtesy: 4, appearance: 4, teamwork: 4, rigor: 4, responsiveness: 4 },
});
verifie("une seconde fiche le même jour remplace la première", reecrit.rating?.id === fiche.rating.id, reecrit);
const jour = await gerant("GET", `/api/staff-performance?venueId=${venueId}`);
const a = jour.staff.find((s) => s.id === awa);
verifie("comportement 4/5 partout = 16/20", a?.behavior?.score === 16, a?.behavior);
const attendu =
  Math.round(
    ((a.salesScore * jour.rules.weights.sales +
      16 * jour.rules.weights.behavior +
      a.punctuality.score * jour.rules.weights.punctuality) /
      100) *
      10
  ) / 10;
verifie("note du jour = moyenne pondérée selon les règles", a.note === attendu, {
  note: a.note,
  attendu,
  a: { s: a.salesScore, p: a.punctuality },
});

// ───────────────────────── Règles de notation
titre("Règles de notation");
const actuelles = (await gerant("GET", `/api/staff-scoring-rules?venueId=${venueId}`)).rules;
const pasCent = await gerant("PUT", "/api/staff-scoring-rules", {
  venueId,
  rules: { ...actuelles, weights: { sales: 50, behavior: 30, punctuality: 30 } },
});
verifie("parts qui ne font pas 100 % refusées", pasCent.status === 400 && /100/.test(pasCent.error), pasCent);
const aucunActif = await gerant("PUT", "/api/staff-scoring-rules", {
  venueId,
  rules: { ...actuelles, criteria: actuelles.criteria.map((c) => ({ ...c, active: false })) },
});
verifie("au moins un critère actif exigé", aucunActif.status === 400, aucunActif);
const nouvelles = {
  ...actuelles,
  weights: { sales: 30, behavior: 50, punctuality: 20 },
  graceMinutes: 10,
  criteria: [
    ...actuelles.criteria.filter((c) => c.key !== "appearance"),
    { key: "hygiene", label: "Hygiène", hint: "Mains, plateau", active: true },
  ],
};
const enregistre = await gerant("PUT", "/api/staff-scoring-rules", { venueId, rules: nouvelles });
verifie(
  "le gérant enregistre de nouvelles règles",
  enregistre.status === 200 && enregistre.effectiveFrom === today,
  enregistre
);
const hier = new Date(`${today}T12:00:00`);
hier.setDate(hier.getDate() - 1);
const hierKey = hier.toISOString().slice(0, 10);
const avant = await gerant("GET", `/api/staff-performance?venueId=${venueId}&workDate=${hierKey}`);
const maintenant = await gerant("GET", `/api/staff-performance?venueId=${venueId}`);
verifie(
  "les jours passés gardent leurs anciennes règles",
  JSON.stringify(avant.rules.weights) !== JSON.stringify(nouvelles.weights),
  avant.rules.weights
);
verifie(
  "aujourd'hui suit les nouvelles règles",
  JSON.stringify(maintenant.rules.weights) === JSON.stringify(nouvelles.weights),
  maintenant.rules.weights
);
const ficheNouveau = await manager("PUT", "/api/staff-ratings", {
  venueId,
  userId: awa,
  workDate: today,
  scores: { courtesy: 5, teamwork: 5, rigor: 5, responsiveness: 5 },
});
verifie(
  "le nouveau critère « Hygiène » est exigé",
  ficheNouveau.status === 400 && /Hygiène/.test(ficheNouveau.error),
  ficheNouveau
);
await gerant("PUT", "/api/staff-scoring-rules", { venueId, rules: actuelles });

// ───────────────────────── Pages
titre("Toutes les pages s'affichent");
const pages = [
  "dashboard",
  "pos",
  "orders",
  "cash-register",
  "products",
  "stock",
  "servers",
  "customers",
  "credit-notes",
  "reservations",
  "suppliers",
  "expenses",
  "reports",
  "assistant",
  "qr-codes",
  "users",
  "venues",
  "audit-log",
  "settings",
  "guide",
  `receipt/${vente1.order.id}`,
  "paiement?statut=retour",
  "paiement?statut=annule",
];
for (const p of pages) {
  const r = await fetch(`${BASE}/${p}`, { headers: { cookie: roles.gerant.cookie }, redirect: "manual" });
  verifie(`/${p}`, r.status === 200, r.status);
}

await pg.end();
console.log(`\n${ok} réussis, ${ko} échoués${ko ? ` :\n - ${echecs.join("\n - ")}` : ""}`);
process.exit(ko ? 1 : 0);
