import type { Role } from "./auth";
import type { Permission } from "./rbac";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Boxes,
  ShoppingCart,
  Wallet,
  Users,
  Building2,
  Landmark,
  Truck,
  Receipt,
  BarChart3,
  Bot,
  Settings,
  ScrollText,
  Star,
  CalendarClock,
  Store,
  QrCode,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  roles?: Role[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, roles: ["super_admin", "gerant", "manager", "caissier"] },
  { href: "/pos", label: "Point de vente", icon: ShoppingCart, permission: "createSale" },
  { href: "/orders", label: "Commandes", icon: UtensilsCrossed, permission: "manageOrders" },
  { href: "/cash-register", label: "Caisse", icon: Wallet, permission: "manageCashRegister" },
  { href: "/products", label: "Produits & Catégories", icon: Store, permission: "manageProducts" },
  { href: "/stock", label: "Stock", icon: Boxes, permission: "viewStock" },
  { href: "/servers", label: "Serveuses", icon: Star, permission: "manageServers" },
  { href: "/customers", label: "Clients & Fidélité", icon: Users, permission: "manageCustomers" },
  { href: "/reservations", label: "Réservations", icon: CalendarClock, permission: "manageReservations" },
  { href: "/suppliers", label: "Fournisseurs", icon: Truck, permission: "manageSuppliers" },
  { href: "/expenses", label: "Dépenses", icon: Receipt, permission: "manageExpenses" },
  { href: "/reports", label: "Rapports & Finances", icon: BarChart3, permission: "viewReports" },
  { href: "/assistant", label: "Assistant IA", icon: Bot, permission: "useAssistant" },
  { href: "/qr-codes", label: "QR Codes tables", icon: QrCode, permission: "manageVenues" },
  { href: "/users", label: "Utilisateurs", icon: Users, permission: "manageUsers" },
  { href: "/venues", label: "Maquis", icon: Landmark, permission: "manageVenues" },
  { href: "/companies", label: "Entreprises", icon: Building2, roles: ["super_admin"] },
  { href: "/audit-log", label: "Journal d'audit", icon: ScrollText, permission: "viewAuditLog" },
  { href: "/guide", label: "Guide d'utilisation", icon: ScrollText },
  { href: "/settings", label: "Paramètres", icon: Settings, roles: ["super_admin", "gerant", "manager", "caissier"] },
];
