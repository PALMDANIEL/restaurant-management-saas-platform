export type LicenseStatus = "active" | "suspended" | "expired";

export type LicenseCheckInput = {
  licenseStatus: LicenseStatus;
  licenseExpiresAt: string | Date | null;
};

export type LicenseCheckResult = {
  /** true si l'entreprise peut être utilisée pour se connecter */
  accessible: boolean;
  /** raison bloquante, le cas échéant */
  reason: "suspended" | "expired" | null;
  message: string | null;
};

/**
 * Évalue si une entreprise a un accès valide, en tenant compte à la fois
 * du statut stocké et de la date d'expiration (une licence "active" mais
 * dont la date est dépassée est considérée comme expirée).
 */
export function checkLicense(company: LicenseCheckInput): LicenseCheckResult {
  if (company.licenseStatus === "suspended") {
    return {
      accessible: false,
      reason: "suspended",
      message: "Accès suspendu. Contactez votre administrateur.",
    };
  }

  const expiresAt = company.licenseExpiresAt ? new Date(company.licenseExpiresAt) : null;
  const isPastExpiry = expiresAt !== null && expiresAt.getTime() < Date.now();

  if (company.licenseStatus === "expired" || isPastExpiry) {
    return {
      accessible: false,
      reason: "expired",
      message: "Licence expirée. Contactez votre administrateur pour la renouveler.",
    };
  }

  return { accessible: true, reason: null, message: null };
}
