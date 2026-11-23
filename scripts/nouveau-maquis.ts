/**
 * Crée une entreprise toute neuve (un maquis, ses comptes, ses produits, ses tables).
 * N'efface RIEN : s'arrête si l'entreprise ou un e-mail existe déjà.
 *
 * Lancer : npx tsx scripts/nouveau-maquis.ts scripts/maquis-exemple.json
 * Les mots de passe générés sont affichés une seule fois, dans le terminal.
 */
import "dotenv/config";
import fs from "node:fs";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { companies, venues, users, userVenues, categories, products, restaurantTables } from "../src/db/schema";

type Config = {
  entreprise: string;
  etablissement: { nom: string; adresse?: string; telephone?: string };
  comptes: { email: string; role: "gerant" | "manager" | "caissier" | "serveuse"; prenom: string; nom: string; telephone?: string }[];
  categories: { nom: string; couleur?: string; produits: { nom: string; prix: number; cout?: number; stock?: number; unite?: string }[] }[];
  tables?: number;
};

function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function motDePasse() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  const fichier = process.argv[2];
  if (!fichier) throw new Error("Indiquez le fichier de configuration (JSON).");
  const cfg: Config = JSON.parse(fs.readFileSync(fichier, "utf8"));
  const slug = slugify(cfg.entreprise);

  const dejaEntreprise = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, slug));
  if (dejaEntreprise.length) throw new Error(`L'entreprise « ${cfg.entreprise} » existe déjà (id ${dejaEntreprise[0].id}).`);
  const dejaEmails = await db.select({ email: users.email }).from(users).where(inArray(users.email, cfg.comptes.map((c) => c.email)));
  if (dejaEmails.length) throw new Error(`E-mail déjà utilisé : ${dejaEmails.map((e) => e.email).join(", ")}`);

  const [company] = await db
    .insert(companies)
    .values({ name: cfg.entreprise, slug, currency: "XOF", licenseStatus: "active" })
    .returning();
  const [venue] = await db
    .insert(venues)
    .values({ companyId: company.id, name: cfg.etablissement.nom, type: "maquis", address: cfg.etablissement.adresse ?? null, phone: cfg.etablissement.telephone ?? null, active: true })
    .returning();

  const identifiants: { email: string; role: string; motDePasse: string }[] = [];
  let n = 0;
  for (const c of cfg.comptes) {
    const mdp = motDePasse();
    const [u] = await db
      .insert(users)
      .values({
        companyId: company.id,
        email: c.email,
        passwordHash: await bcrypt.hash(mdp, 10),
        role: c.role,
        firstName: c.prenom,
        lastName: c.nom,
        phone: c.telephone ?? null,
        matricule: c.role === "serveuse" ? `SRV-${String(++n).padStart(3, "0")}` : null,
        active: true,
      })
      .returning();
    await db.insert(userVenues).values({ userId: u.id, venueId: venue.id });
    identifiants.push({ email: c.email, role: c.role, motDePasse: mdp });
  }

  let nbProduits = 0;
  for (const cat of cfg.categories) {
    const [row] = await db.insert(categories).values({ venueId: venue.id, name: cat.nom, color: cat.couleur ?? "#f97316" }).returning();
    for (const p of cat.produits) {
      await db.insert(products).values({
        venueId: venue.id,
        categoryId: row.id,
        name: p.nom,
        price: p.prix,
        costPrice: p.cout ?? 0,
        unit: p.unite ?? "unité",
        stockQuantity: String(p.stock ?? 50),
        stockAlertThreshold: "5",
        active: true,
      });
      nbProduits++;
    }
  }
  for (let i = 1; i <= (cfg.tables ?? 0); i++) {
    await db.insert(restaurantTables).values({ venueId: venue.id, number: String(i), capacity: 4 });
  }

  console.log(`\nEntreprise créée : ${company.name} (id ${company.id}) — ${nbProduits} produits, ${cfg.tables ?? 0} tables\n`);
  console.log("Identifiants (à noter maintenant, affichés une seule fois) :");
  for (const i of identifiants) console.log(`  ${i.role.padEnd(9)} ${i.email}   ${i.motDePasse}`);
  console.log("");
}

main()
  .catch((e) => {
    console.error("Échec :", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool?.end());
