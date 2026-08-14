/**
 * Seed script — populates the database with a realistic demo dataset:
 * 1 company, 2 maquis (venues), users for every role, categories,
 * products, servers, a few orders/sales, expenses, suppliers, etc.
 *
 * Run with: npx tsx scripts/seed.ts
 */
import "dotenv/config";
import { db, pool } from "../src/db";
import {
  companies,
  venues,
  users,
  userVenues,
  categories,
  products,
  restaurantTables,
  customers,
  orders,
  orderItems,
  payments,
  cashSessions,
  expenses,
  suppliers,
  supplierOrders,
  supplierOrderItems,
  stockMovements,
} from "../src/db/schema";
import bcrypt from "bcryptjs";

async function main() {
  console.log("🌱 Seeding database...");

  // Clean up (order matters due to FKs) — safe for demo/dev reseeding.
  await db.execute(`TRUNCATE TABLE
    audit_logs, notifications, refresh_tokens,
    supplier_order_items, supplier_orders, suppliers,
    expenses, cash_sessions, payments, order_items, orders,
    loyalty_transactions, reservations, customers, restaurant_tables,
    stock_movements, price_history, promotions, products, categories,
    user_venues, users, venues, companies
    RESTART IDENTITY CASCADE`);

  const [company] = await db
    .insert(companies)
    .values({ name: "Groupe Le Bon Coin", slug: "le-bon-coin", currency: "XOF" })
    .returning();

  const [venue1] = await db
    .insert(venues)
    .values({
      companyId: company.id,
      name: "Maquis Le Bon Coin - Cocody",
      type: "maquis",
      address: "Rue des Jardins, Cocody, Abidjan",
      phone: "+225 07 00 00 00 01",
      qrOrderingEnabled: true,
      active: true,
    })
    .returning();

  const [venue2] = await db
    .insert(venues)
    .values({
      companyId: company.id,
      name: "Maquis Le Bon Coin - Yopougon",
      type: "maquis",
      address: "Marché Siporex, Yopougon, Abidjan",
      phone: "+225 07 00 00 00 02",
      qrOrderingEnabled: false,
      active: true,
    })
    .returning();

  const password = await bcrypt.hash("password123", 10);

  const userDefs = [
    { email: "superadmin@maquis.app", role: "super_admin" as const, firstName: "Aya", lastName: "Kouassi", venues: [venue1.id, venue2.id] },
    { email: "gerant@maquis.app", role: "gerant" as const, firstName: "Jean", lastName: "Kouadio", venues: [venue1.id, venue2.id] },
    { email: "manager@maquis.app", role: "manager" as const, firstName: "Fatou", lastName: "Traoré", venues: [venue1.id] },
    { email: "caissier@maquis.app", role: "caissier" as const, firstName: "Yao", lastName: "N'Guessan", venues: [venue1.id] },
    { email: "serveuse@maquis.app", role: "serveuse" as const, firstName: "Awa", lastName: "Diabaté", venues: [venue1.id], matricule: "SRV-001" },
    { email: "serveuse2@maquis.app", role: "serveuse" as const, firstName: "Mariam", lastName: "Bamba", venues: [venue1.id], matricule: "SRV-002" },
    { email: "serveuse3@maquis.app", role: "serveuse" as const, firstName: "Adjoua", lastName: "Kacou", venues: [venue2.id], matricule: "SRV-003" },
  ];

  const createdUsers: Record<string, number> = {};
  for (const def of userDefs) {
    const [u] = await db
      .insert(users)
      .values({
        companyId: company.id,
        email: def.email,
        passwordHash: password,
        role: def.role,
        firstName: def.firstName,
        lastName: def.lastName,
        phone: "+225 05 00 00 00 00",
        matricule: "matricule" in def ? def.matricule : null,
        active: true,
      })
      .returning();
    createdUsers[def.email] = u.id;
    for (const vId of def.venues) {
      await db.insert(userVenues).values({ userId: u.id, venueId: vId });
    }
  }

  // Categories & Products for venue1
  const catDefs = [
    { name: "Boissons", color: "#3b82f6" },
    { name: "Grillades", color: "#f97316" },
    { name: "Poissons", color: "#0ea5e9" },
    { name: "Accompagnements", color: "#22c55e" },
  ];
  const catIds: Record<string, number> = {};
  for (const venue of [venue1, venue2]) {
    for (const c of catDefs) {
      const [cat] = await db
        .insert(categories)
        .values({ venueId: venue.id, name: c.name, color: c.color })
        .returning();
      catIds[`${venue.id}-${c.name}`] = cat.id;
    }
  }

  const productDefs = [
    { name: "Bière Flag 65cl", cat: "Boissons", price: 1000, cost: 600, stock: 120 },
    { name: "Bière Ivoire 65cl", cat: "Boissons", price: 1000, cost: 600, stock: 90 },
    { name: "Coca-Cola 33cl", cat: "Boissons", price: 500, cost: 250, stock: 150 },
    { name: "Eau minérale 1.5L", cat: "Boissons", price: 500, cost: 200, stock: 200 },
    { name: "Poulet braisé", cat: "Grillades", price: 3500, cost: 1800, stock: 40 },
    { name: "Brochettes de bœuf", cat: "Grillades", price: 2000, cost: 1000, stock: 60 },
    { name: "Côtelettes de porc", cat: "Grillades", price: 3000, cost: 1500, stock: 30 },
    { name: "Poisson braisé (Tilapia)", cat: "Poissons", price: 4000, cost: 2200, stock: 25 },
    { name: "Capitaine grillé", cat: "Poissons", price: 5000, cost: 2800, stock: 3 },
    { name: "Attiéké", cat: "Accompagnements", price: 500, cost: 150, stock: 100 },
    { name: "Alloco", cat: "Accompagnements", price: 1000, cost: 400, stock: 8 },
    { name: "Frites", cat: "Accompagnements", price: 1000, cost: 400, stock: 70 },
  ];

  const productIds: Record<string, number> = {};
  for (const p of productDefs) {
    const [prod] = await db
      .insert(products)
      .values({
        venueId: venue1.id,
        categoryId: catIds[`${venue1.id}-${p.cat}`],
        name: p.name,
        price: p.price,
        costPrice: p.cost,
        stockQuantity: String(p.stock),
        stockAlertThreshold: "10",
        unit: "unité",
        active: true,
      })
      .returning();
    productIds[p.name] = prod.id;
    await db.insert(stockMovements).values({
      venueId: venue1.id,
      productId: prod.id,
      type: "in",
      quantity: String(p.stock),
      reason: "Stock initial",
      createdBy: createdUsers["gerant@maquis.app"],
    });
  }
  // Some products also for venue2 (smaller set)
  for (const p of productDefs.slice(0, 6)) {
    await db.insert(products).values({
      venueId: venue2.id,
      categoryId: catIds[`${venue2.id}-${p.cat}`],
      name: p.name,
      price: p.price,
      costPrice: p.cost,
      stockQuantity: String(Math.round(p.stock / 2)),
      stockAlertThreshold: "10",
      unit: "unité",
      active: true,
    });
  }

  // Tables
  const tableIds: number[] = [];
  for (let i = 1; i <= 10; i++) {
    const [t] = await db
      .insert(restaurantTables)
      .values({ venueId: venue1.id, number: String(i), capacity: 4 })
      .returning();
    tableIds.push(t.id);
  }

  // Customers
  const [customer1] = await db
    .insert(customers)
    .values({ venueId: venue1.id, name: "Kouassi Bernard", phone: "+225 01 02 03 04", loyaltyPoints: 45, totalSpent: 45000 })
    .returning();
  await db.insert(customers).values({ venueId: venue1.id, name: "Diallo Fanta", phone: "+225 05 06 07 08", loyaltyPoints: 12, totalSpent: 12000 });

  // Orders + payments across last 30 days
  const servers = [createdUsers["serveuse@maquis.app"], createdUsers["serveuse2@maquis.app"]];
  const productList = Object.entries(productIds);
  const cashierId = createdUsers["caissier@maquis.app"];

  const [cashSession] = await db
    .insert(cashSessions)
    .values({
      venueId: venue1.id,
      openedBy: cashierId,
      openingAmount: 20000,
      status: "open",
    })
    .returning();

  for (let day = 29; day >= 0; day--) {
    const numOrders = 3 + Math.floor(Math.random() * 8);
    for (let i = 0; i < numOrders; i++) {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - day);
      createdAt.setHours(11 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));

      const serverId = servers[Math.floor(Math.random() * servers.length)];
      const itemCount = 1 + Math.floor(Math.random() * 3);
      let total = 0;
      const chosenItems: { productId: number; qty: number; price: number }[] = [];
      for (let j = 0; j < itemCount; j++) {
        const [, pid] = productList[Math.floor(Math.random() * productList.length)];
        const prodDef = productDefs.find((p) => productIds[p.name] === pid)!;
        const qty = 1 + Math.floor(Math.random() * 3);
        chosenItems.push({ productId: pid, qty, price: prodDef.price });
        total += qty * prodDef.price;
      }

      const status = day === 0 && i === numOrders - 1 ? "new" : "paid";

      const [order] = await db
        .insert(orders)
        .values({
          venueId: venue1.id,
          tableId: tableIds[Math.floor(Math.random() * tableIds.length)],
          serverId,
          cashierId,
          status,
          source: Math.random() > 0.7 ? "client_app" : "pos",
          totalAmount: total,
          createdAt,
          updatedAt: createdAt,
          customerId: Math.random() > 0.85 ? customer1.id : null,
        })
        .returning();

      for (const it of chosenItems) {
        await db.insert(orderItems).values({
          orderId: order.id,
          productId: it.productId,
          quantity: String(it.qty),
          unitPrice: it.price,
        });
      }

      if (status === "paid") {
        const methods = ["cash", "cash", "mobile_money", "card"] as const;
        await db.insert(payments).values({
          orderId: order.id,
          venueId: venue1.id,
          cashSessionId: cashSession.id,
          method: methods[Math.floor(Math.random() * methods.length)],
          amount: total,
          receivedBy: cashierId,
          createdAt,
        });
      }
    }
  }

  // Expenses
  const expenseDefs = [
    { category: "Loyer", label: "Loyer mensuel du local", amount: 150000 },
    { category: "Électricité", label: "Facture CIE", amount: 45000 },
    { category: "Eau", label: "Facture SODECI", amount: 15000 },
    { category: "Salaires", label: "Salaire personnel - avance", amount: 200000 },
    { category: "Achats", label: "Achat charbon et bois", amount: 25000 },
  ];
  for (const e of expenseDefs) {
    const d = new Date();
    d.setDate(1);
    await db.insert(expenses).values({
      venueId: venue1.id,
      category: e.category,
      label: e.label,
      amount: e.amount,
      expenseDate: d.toISOString().slice(0, 10),
      createdBy: createdUsers["manager@maquis.app"],
    });
  }

  // Suppliers
  const [supplier1] = await db
    .insert(suppliers)
    .values({
      venueId: venue1.id,
      name: "Brasseries de Côte d'Ivoire (SOLIBRA)",
      contactName: "Service commercial",
      phone: "+225 27 20 00 00 00",
      email: "commercial@solibra.ci",
    })
    .returning();
  const [supOrder] = await db
    .insert(supplierOrders)
    .values({
      supplierId: supplier1.id,
      venueId: venue1.id,
      status: "received",
      totalAmount: 120000,
      paidAmount: 120000,
      orderDate: new Date().toISOString().slice(0, 10),
      receivedDate: new Date().toISOString().slice(0, 10),
      createdBy: createdUsers["manager@maquis.app"],
    })
    .returning();
  await db.insert(supplierOrderItems).values({
    supplierOrderId: supOrder.id,
    productId: productIds["Bière Flag 65cl"],
    description: "Casier Bière Flag",
    quantity: "10",
    unitCost: 12000,
  });

  // ============================================================
  // Entreprises de test pour la licence d'accessibilité
  // Chaque entreprise a 1 venue + 1 compte gérant, avec une
  // configuration de licence différente pour tester chaque cas.
  // ============================================================
  const inOneYear = new Date();
  inOneYear.setFullYear(inOneYear.getFullYear() + 1);
  const inThePast = new Date();
  inThePast.setDate(inThePast.getDate() - 3);

  const testCompanyDefs = [
    {
      name: "Maquis Test - Licence Active",
      slug: "test-active",
      licenseStatus: "active" as const,
      licenseExpiresAt: inOneYear,
      maxUsers: null as number | null,
      expected: "Connexion OK (licence active, pas d'expiration proche)",
    },
    {
      name: "Maquis Test - Sans date d'expiration",
      slug: "test-sans-expiration",
      licenseStatus: "active" as const,
      licenseExpiresAt: null,
      maxUsers: 5,
      expected: "Connexion OK (licence active, aucune expiration définie)",
    },
    {
      name: "Maquis Test - Suspendu",
      slug: "test-suspendu",
      licenseStatus: "suspended" as const,
      licenseExpiresAt: null,
      maxUsers: null as number | null,
      expected: "Connexion refusée (statut = suspendu)",
    },
    {
      name: "Maquis Test - Expiré (statut)",
      slug: "test-expire-statut",
      licenseStatus: "expired" as const,
      licenseExpiresAt: null,
      maxUsers: null as number | null,
      expected: "Connexion refusée (statut = expiré)",
    },
    {
      name: "Maquis Test - Expiré (date dépassée)",
      slug: "test-expire-date",
      licenseStatus: "active" as const,
      licenseExpiresAt: inThePast,
      maxUsers: null as number | null,
      expected: "Connexion refusée (date d'expiration dépassée malgré statut 'active')",
    },
    {
      name: "Maquis Test - Quota de sièges atteint",
      slug: "test-quota-sieges",
      licenseStatus: "active" as const,
      licenseExpiresAt: inOneYear,
      maxUsers: 1,
      expected: "Connexion OK, mais impossible de créer un nouvel utilisateur (quota = 1, déjà atteint)",
    },
  ];

  const testAccounts: { company: string; email: string; expected: string }[] = [];

  for (const def of testCompanyDefs) {
    const [testCompany] = await db
      .insert(companies)
      .values({
        name: def.name,
        slug: def.slug,
        currency: "XOF",
        licenseStatus: def.licenseStatus,
        licenseExpiresAt: def.licenseExpiresAt,
        maxUsers: def.maxUsers,
      })
      .returning();

    const [testVenue] = await db
      .insert(venues)
      .values({
        companyId: testCompany.id,
        name: `${def.name} - Venue principale`,
        type: "maquis",
        address: "Abidjan, Côte d'Ivoire",
        active: true,
      })
      .returning();

    const testEmail = `gerant@${def.slug}.app`;
    const [testUser] = await db
      .insert(users)
      .values({
        companyId: testCompany.id,
        email: testEmail,
        passwordHash: password,
        role: "gerant",
        firstName: "Test",
        lastName: def.name.replace("Maquis Test - ", ""),
        active: true,
      })
      .returning();
    await db.insert(userVenues).values({ userId: testUser.id, venueId: testVenue.id });

    testAccounts.push({ company: def.name, email: testEmail, expected: def.expected });
  }

  console.log("✅ Seed completed successfully!");
  console.log("\nComptes de démonstration (mot de passe: password123):");
  for (const def of userDefs) {
    console.log(` - ${def.role.padEnd(12)} ${def.email}`);
  }

  console.log("\n🏢 Entreprises de test - licence d'accessibilité (mot de passe: password123):");
  for (const a of testAccounts) {
    console.log(` - ${a.company}\n     email: ${a.email}\n     attendu: ${a.expected}`);
  }
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool) await pool.end();
  });
