// Serveur LigdiCash simulé : crée des factures et répond à la confirmation.
// POST /_payer?token=… marque une facture payée ; GET /_etat liste les appels reçus.
import http from "node:http";
const invoices = new Map();
const calls = [];
let n = 0;
http
  .createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const url = new URL(req.url, "http://x");
    calls.push({ method: req.method, path: url.pathname, apikey: req.headers.apikey, auth: req.headers.authorization });
    const send = (o, code = 200) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(o));
    };
    if (url.pathname.endsWith("/redirect/checkout-invoice/create")) {
      if (req.headers.apikey !== "CLE-ESSAI") return send({ response_code: "01", description: "Clé API invalide" });
      const cmd = JSON.parse(body).commande;
      const token = `tok${++n}`;
      invoices.set(token, { status: "pending", montant: cmd.invoice.total_amount, cmd });
      return send({ response_code: "00", token, response_text: `http://localhost:3199/payer/${token}` });
    }
    if (url.pathname.endsWith("/redirect/checkout-invoice/confirm/")) {
      const inv = invoices.get(url.searchParams.get("invoiceToken"));
      if (!inv) return send({ response_code: "01", status: "notfound" });
      return send({ response_code: "00", status: inv.status, montant: inv.montant, operator_name: "Orange Money" });
    }
    if (url.pathname === "/_payer") {
      const inv = invoices.get(url.searchParams.get("token"));
      if (!inv) return send({ ok: false }, 404);
      inv.status = url.searchParams.get("etat") || "completed";
      if (url.searchParams.get("montant")) inv.montant = Number(url.searchParams.get("montant"));
      return send({ ok: true });
    }
    if (url.pathname === "/_etat") return send({ invoices: [...invoices.entries()], calls });
    send({ error: "inconnu" }, 404);
  })
  .listen(3199, () => console.log("faux LigdiCash prêt sur 3199"));
