import type { Role } from "./auth";

/**
 * Central RBAC permission matrix.
 * Each key maps to the list of roles allowed to perform that action.
 */
export const PERMISSIONS = {
  manageCompanies: ["super_admin"],
  manageVenues: ["super_admin", "gerant"],
  manageUsers: ["super_admin", "gerant"],
  manageServers: ["super_admin", "gerant", "manager"],
  manageProducts: ["super_admin", "gerant"],
  manageCategories: ["super_admin", "gerant"],
  viewStock: ["super_admin", "gerant", "manager", "caissier"],
  manageStock: ["super_admin", "gerant", "manager"],
  createSale: ["super_admin", "gerant", "manager", "caissier"],
  editSale: ["super_admin", "gerant", "manager", "caissier"],
  cancelSale: ["super_admin", "gerant", "manager", "caissier"],
  manageCashRegister: ["super_admin", "gerant", "manager", "caissier"],
  viewFinance: ["super_admin", "gerant", "manager"],
  manageExpenses: ["super_admin", "gerant", "manager"],
  manageSuppliers: ["super_admin", "gerant", "manager"],
  viewReports: ["super_admin", "gerant", "manager"],
  manageOrders: ["super_admin", "gerant", "manager", "caissier", "serveuse"],
  viewAuditLog: ["super_admin", "gerant"],
  useAssistant: ["super_admin", "gerant", "manager"],
  manageCustomers: ["super_admin", "gerant", "manager", "caissier"],
  manageReservations: ["super_admin", "gerant", "manager", "caissier"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, permission: Permission) {
  if (!role) return false;
  if (role === "platform_admin") return true; // accès total, toutes entreprises confondues
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export function assertCan(role: Role | undefined | null, permission: Permission) {
  if (!can(role, permission)) {
    throw new ForbiddenError(`Role ${role} is not allowed to ${permission}`);
  }
}

/** Réservé à l'écran d'administration de la plateforme (gestion des entreprises/licences/comptes admin). */
export function assertPlatformAdmin(role: Role | undefined | null) {
  if (role !== "platform_admin") {
    throw new ForbiddenError("Accès réservé à l'administrateur de la plateforme");
  }
}

export class ForbiddenError extends Error {
  status = 403;
}

export class UnauthorizedError extends Error {
  status = 401;
}
