import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  pgEnum,
  jsonb,
  numeric,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ============================= ENUMS =============================
export const roleEnum = pgEnum("role", [
  "super_admin",
  "gerant",
  "manager",
  "caissier",
  "serveuse",
]);

export const licenseStatusEnum = pgEnum("license_status", [
  "active",
  "suspended",
  "expired",
]);

export const venueTypeEnum = pgEnum("venue_type", [
  "maquis",
  "restaurant",
  "bar",
  "fastfood",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "new",
  "preparing",
  "served",
  "paid",
  "cancelled",
]);

export const orderSourceEnum = pgEnum("order_source", ["pos", "client_app"]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "card",
  "mobile_money",
  "mixed",
  "credit_note",
  "ligdicash",
]);

export const ligdicashInvoiceStatusEnum = pgEnum("ligdicash_invoice_status", [
  "pending",
  "paid",
  "failed",
  "cancelled",
]);

export const creditNoteStatusEnum = pgEnum("credit_note_status", [
  "active",
  "used",
  "cancelled",
]);

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "in",
  "out",
  "adjustment",
  "loss",
]);

export const cashSessionStatusEnum = pgEnum("cash_session_status", [
  "open",
  "closed",
]);

export const supplierOrderStatusEnum = pgEnum("supplier_order_status", [
  "pending",
  "received",
  "cancelled",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "new_order",
  "low_stock",
  "out_of_stock",
  "new_sale",
  "new_customer",
  "system",
]);

export const loyaltyTransactionTypeEnum = pgEnum("loyalty_transaction_type", [
  "earn",
  "redeem",
  "adjustment",
]);

export const reservationStatusEnum = pgEnum("reservation_status", [
  "pending",
  "confirmed",
  "seated",
  "cancelled",
  "completed",
]);

export const discountTypeEnum = pgEnum("discount_type", ["percentage", "amount"]);

export const shiftGroupEnum = pgEnum("shift_group", ["jour", "soir"]);

// ============================= COMPANIES =============================
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  logoUrl: text("logo_url"),
  currency: varchar("currency", { length: 10 }).notNull().default("XOF"),
  licenseStatus: licenseStatusEnum("license_status").notNull().default("active"),
  licenseExpiresAt: timestamp("license_expires_at"),
  maxUsers: integer("max_users"),
  // Compte marchand LigdiCash de l'entreprise (Orange Money, Moov Money) : l'argent arrive
  // directement chez le restaurant, jamais sur un compte de la plateforme.
  ligdicashApiKey: text("ligdicash_api_key"),
  ligdicashAuthToken: text("ligdicash_auth_token"),
  ligdicashLive: boolean("ligdicash_live").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================= VENUES (MAQUIS) =============================
export const venues = pgTable(
  "venues",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    type: venueTypeEnum("type").notNull().default("maquis"),
    address: text("address"),
    phone: varchar("phone", { length: 30 }),
    qrOrderingEnabled: boolean("qr_ordering_enabled").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("venues_company_idx").on(t.companyId)]
);

// ============================= USERS =============================
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 200 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    photoUrl: text("photo_url"),
    active: boolean("active").notNull().default(true),
    matricule: varchar("matricule", { length: 30 }),
    // Équipe fixe assignée (personnel de salle) : journée ou soirée. Nullable pour les rôles
    // qui ne travaillent pas en rotation jour/soir (gérant, manager...).
    shiftGroup: shiftGroupEnum("shift_group"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("users_company_idx").on(t.companyId),
    index("users_role_idx").on(t.role),
  ]
);

// Many-to-many: which venues a manager/gerant/caissier/serveuse is assigned to
export const userVenues = pgTable(
  "user_venues",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("user_venue_unique").on(t.userId, t.venueId)]
);

// ============================= CATEGORIES / PRODUCTS =============================
export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    color: varchar("color", { length: 20 }).default("#f97316"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("categories_venue_idx").on(t.venueId)]
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    price: integer("price").notNull(),
    costPrice: integer("cost_price").notNull().default(0),
    unit: varchar("unit", { length: 30 }).notNull().default("unité"),
    imageUrl: text("image_url"),
    barcode: varchar("barcode", { length: 100 }),
    stockQuantity: numeric("stock_quantity", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    stockAlertThreshold: numeric("stock_alert_threshold", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("5"),
    expiryDate: date("expiry_date"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("products_venue_idx").on(t.venueId),
    index("products_category_idx").on(t.categoryId),
  ]
);

export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  oldPrice: integer("old_price").notNull(),
  newPrice: integer("new_price").notNull(),
  changedBy: integer("changed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
});

export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id")
    .notNull()
    .references(() => venues.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 150 }).notNull(),
  discountType: discountTypeEnum("discount_type").notNull().default("percentage"),
  discountValue: integer("discount_value").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================= STOCK MOVEMENTS =============================
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: stockMovementTypeEnum("type").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason"),
    referenceType: varchar("reference_type", { length: 50 }),
    referenceId: integer("reference_id"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_venue_idx").on(t.venueId),
    index("stock_movements_product_idx").on(t.productId),
  ]
);

// ============================= TABLES (RESTAURANT TABLES) =============================
export const restaurantTables = pgTable(
  "restaurant_tables",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    number: varchar("number", { length: 20 }).notNull(),
    capacity: integer("capacity").notNull().default(4),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("table_venue_number_unique").on(t.venueId, t.number)]
);

// ============================= ÉQUIPES JOUR / SOIR & POINTAGE =============================
// Bornes horaires configurables par point de vente pour distinguer l'équipe du jour de
// l'équipe du soir. nightEndTime est l'heure de l'aube : toute pointage/vente enregistré
// avant cette heure est rattaché à la "journée d'exploitation" de la veille (le service du
// soir qui déborde après minuit reste comptabilisé sur la soirée où il a commencé).
export const venueShiftSettings = pgTable(
  "venue_shift_settings",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .unique()
      .references(() => venues.id, { onDelete: "cascade" }),
    dayStartTime: varchar("day_start_time", { length: 5 }).notNull().default("07:00"),
    dayEndTime: varchar("day_end_time", { length: 5 }).notNull().default("19:00"),
    nightStartTime: varchar("night_start_time", { length: 5 }).notNull().default("19:00"),
    nightEndTime: varchar("night_end_time", { length: 5 }).notNull().default("06:00"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

// Pointages : heure d'arrivée / de départ de chaque membre du personnel.
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shiftGroup: shiftGroupEnum("shift_group").notNull(),
    // Journée d'exploitation à laquelle rattacher ce pointage (voir nightEndTime ci-dessus).
    workDate: date("work_date").notNull(),
    clockIn: timestamp("clock_in").notNull().defaultNow(),
    clockOut: timestamp("clock_out"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("attendance_venue_idx").on(t.venueId),
    index("attendance_user_idx").on(t.userId),
    index("attendance_work_date_idx").on(t.workDate),
  ]
);

// ============================= CUSTOMERS (LOYALTY) =============================
export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    totalSpent: integer("total_spent").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("customers_venue_idx").on(t.venueId)]
);

export const loyaltyTransactions = pgTable(
  "loyalty_transactions",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: loyaltyTransactionTypeEnum("type").notNull(),
    points: integer("points").notNull(),
    orderId: integer("order_id"),
    note: text("note"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("loyalty_transactions_customer_idx").on(t.customerId)]
);

// ============================= ORDERS =============================
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    tableId: integer("table_id").references(() => restaurantTables.id, {
      onDelete: "set null",
    }),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    serverId: integer("server_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cashierId: integer("cashier_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: orderStatusEnum("status").notNull().default("new"),
    source: orderSourceEnum("source").notNull().default("pos"),
    notes: text("notes"),
    totalAmount: integer("total_amount").notNull().default(0),
    servedAt: timestamp("served_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("orders_venue_idx").on(t.venueId),
    index("orders_status_idx").on(t.status),
    index("orders_server_idx").on(t.serverId),
    index("orders_created_idx").on(t.createdAt),
  ]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    unitPrice: integer("unit_price").notNull(),
    observations: text("observations"),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)]
);

// ============================= AVOIRS (CREDIT NOTES) =============================
// Émis principalement quand la caisse manque de monnaie à rendre : plutôt que de
// rendre l'appoint en espèces, on émet un avoir que le client pourra utiliser lors
// d'un prochain passage. Peuvent aussi être émis manuellement (ex : retour produit).
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    code: varchar("code", { length: 30 }).notNull().unique(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    cashSessionId: integer("cash_session_id").references(() => cashSessions.id, {
      onDelete: "set null",
    }),
    amount: integer("amount").notNull(),
    remainingAmount: integer("remaining_amount").notNull(),
    reason: text("reason"),
    status: creditNoteStatusEnum("status").notNull().default("active"),
    issuedBy: integer("issued_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    usedAt: timestamp("used_at"),
  },
  (t) => [
    index("credit_notes_venue_idx").on(t.venueId),
    index("credit_notes_customer_idx").on(t.customerId),
    index("credit_notes_status_idx").on(t.status),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    cashSessionId: integer("cash_session_id").references(() => cashSessions.id, { onDelete: "set null" }),
    method: paymentMethodEnum("method").notNull().default("cash"),
    // Part du total de la commande couverte par ce règlement (sert au CA / rapports).
    amount: integer("amount").notNull(),
    // Espèces réellement tendues par le client (paiements en cash uniquement).
    amountReceived: integer("amount_received"),
    // Monnaie effectivement rendue en espèces (0 si la différence a été couverte par un avoir).
    changeGiven: integer("change_given"),
    // Avoir émis à cause d'un manque de monnaie sur ce règlement.
    creditNoteIssuedId: integer("credit_note_issued_id").references(() => creditNotes.id, {
      onDelete: "set null",
    }),
    // Avoir utilisé (en tout ou partie) pour régler ce paiement.
    creditNoteRedeemedId: integer("credit_note_redeemed_id").references(() => creditNotes.id, {
      onDelete: "set null",
    }),
    receivedBy: integer("received_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("payments_venue_idx").on(t.venueId),
    index("payments_order_idx").on(t.orderId),
    index("payments_created_idx").on(t.createdAt),
  ]
);

// ============================= PAIEMENTS LIGDICASH =============================
// Une facture LigdiCash par tentative de paiement en ligne. La commande n'est réglée
// (ligne dans `payments`) qu'une fois LigdiCash ayant confirmé le paiement.
export const ligdicashInvoices = pgTable(
  "ligdicash_invoices",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    cashSessionId: integer("cash_session_id").references(() => cashSessions.id, { onDelete: "set null" }),
    // Montant demandé au client (total de la commande moins l'éventuel avoir).
    amount: integer("amount").notNull(),
    // Avoir à appliquer sur le reste de la commande au moment de la confirmation.
    creditNoteCode: varchar("credit_note_code", { length: 20 }),
    token: text("token").unique(),
    paymentUrl: text("payment_url"),
    status: ligdicashInvoiceStatusEnum("status").notNull().default("pending"),
    operator: varchar("operator", { length: 60 }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    paidAt: timestamp("paid_at"),
  },
  (t) => [
    index("ligdicash_invoices_order_idx").on(t.orderId),
    index("ligdicash_invoices_venue_idx").on(t.venueId),
  ]
);

// ============================= CASH SESSIONS (CAISSE) =============================
export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    openedBy: integer("opened_by").references(() => users.id, {
      onDelete: "set null",
    }),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    openingAmount: integer("opening_amount").notNull().default(0),
    closedBy: integer("closed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    closedAt: timestamp("closed_at"),
    closingAmount: integer("closing_amount"),
    expectedAmount: integer("expected_amount"),
    difference: integer("difference"),
    status: cashSessionStatusEnum("status").notNull().default("open"),
    notes: text("notes"),
  },
  (t) => [
    index("cash_sessions_venue_idx").on(t.venueId),
    index("cash_sessions_status_idx").on(t.status),
  ]
);

// ============================= EXPENSES =============================
export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("expense_categories_venue_idx").on(t.venueId)]
);

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 100 }).notNull(),
    label: varchar("label", { length: 200 }).notNull(),
    amount: integer("amount").notNull(),
    expenseDate: date("expense_date").notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("expenses_venue_idx").on(t.venueId)]
);

// ============================= SUPPLIERS =============================
export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    contactName: varchar("contact_name", { length: 150 }),
    phone: varchar("phone", { length: 30 }),
    email: varchar("email", { length: 150 }),
    address: text("address"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("suppliers_venue_idx").on(t.venueId)]
);

export const supplierOrders = pgTable(
  "supplier_orders",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    status: supplierOrderStatusEnum("status").notNull().default("pending"),
    totalAmount: integer("total_amount").notNull().default(0),
    paidAmount: integer("paid_amount").notNull().default(0),
    orderDate: date("order_date").notNull(),
    receivedDate: date("received_date"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("supplier_orders_venue_idx").on(t.venueId)]
);

export const supplierOrderItems = pgTable("supplier_order_items", {
  id: serial("id").primaryKey(),
  supplierOrderId: integer("supplier_order_id")
    .notNull()
    .references(() => supplierOrders.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  description: varchar("description", { length: 200 }),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  unitCost: integer("unit_cost").notNull(),
});

// ============================= RESERVATIONS =============================
export const reservations = pgTable(
  "reservations",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    tableId: integer("table_id").references(() => restaurantTables.id, {
      onDelete: "set null",
    }),
    customerName: varchar("customer_name", { length: 150 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    partySize: integer("party_size").notNull().default(2),
    reservationTime: timestamp("reservation_time").notNull(),
    status: reservationStatusEnum("status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("reservations_venue_idx").on(t.venueId)]
);

// ============================= NOTIFICATIONS =============================
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    type: notificationTypeEnum("type").notNull().default("system"),
    title: varchar("title", { length: 150 }).notNull(),
    message: text("message").notNull(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notifications_venue_idx").on(t.venueId),
    index("notifications_user_idx").on(t.userId),
  ]
);

// ============================= AUDIT LOG =============================
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    venueId: integer("venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 100 }).notNull(),
    entity: varchar("entity", { length: 100 }).notNull(),
    entityId: integer("entity_id"),
    details: jsonb("details"),
    ipAddress: varchar("ip_address", { length: 60 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_user_idx").on(t.userId),
    index("audit_logs_venue_idx").on(t.venueId),
    index("audit_logs_created_idx").on(t.createdAt),
  ]
);

// ============================= REFRESH TOKENS =============================
export const refreshTokens = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revoked: boolean("revoked").notNull().default(false),
});
