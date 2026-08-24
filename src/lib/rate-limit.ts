/**
 * Anti-brute-force très simple pour /api/auth/login, basé sur un compteur en mémoire par
 * (email + IP). Ce n'est pas un remplacement pour une solution distribuée (Redis, etc.) —
 * sur un déploiement multi-instances chaque instance a son propre compteur — mais ça bloque
 * déjà les tentatives automatisées basiques, ce qui n'existait pas du tout auparavant.
 */

/**
 * Anti-abus très simple basé sur un compteur en mémoire par clé (ex: IP, ou IP+email).
 * Ce n'est pas un remplacement pour une solution distribuée (Redis, etc.) — sur un déploiement
 * multi-instances chaque instance a son propre compteur — mais ça bloque déjà les tentatives
 * automatisées basiques (brute force de connexion, spam de commandes publiques), ce qui
 * n'existait pas du tout auparavant.
 */

type Bucket = { count: number; firstAttemptAt: number };

class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastCleanup = 0;

  constructor(private windowMs: number, private maxAttempts: number) {}

  private cleanup(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.firstAttemptAt > this.windowMs) this.buckets.delete(key);
    }
  }

  isLimited(identifier: string): boolean {
    const now = Date.now();
    if (now - this.lastCleanup > this.windowMs) {
      this.cleanup(now);
      this.lastCleanup = now;
    }
    const bucket = this.buckets.get(identifier);
    if (!bucket) return false;
    if (now - bucket.firstAttemptAt > this.windowMs) {
      this.buckets.delete(identifier);
      return false;
    }
    return bucket.count >= this.maxAttempts;
  }

  record(identifier: string): void {
    const now = Date.now();
    const bucket = this.buckets.get(identifier);
    if (!bucket || now - bucket.firstAttemptAt > this.windowMs) {
      this.buckets.set(identifier, { count: 1, firstAttemptAt: now });
      return;
    }
    bucket.count += 1;
  }

  clear(identifier: string): void {
    this.buckets.delete(identifier);
  }
}

const loginLimiter = new RateLimiter(10 * 60 * 1000, 8); // 8 tentatives / 10 min

export function isLoginRateLimited(identifier: string): boolean {
  return loginLimiter.isLimited(identifier);
}
export function recordFailedLogin(identifier: string): void {
  loginLimiter.record(identifier);
}
export function clearLoginAttempts(identifier: string): void {
  loginLimiter.clear(identifier);
}

// Endpoint public (sans authentification) de commande via QR code : throttle plus permissif
// (usage légitime multi-clients sur un même point de vente / même box internet) mais empêche
// le spam automatisé de commandes.
const orderAppLimiter = new RateLimiter(60 * 1000, 20); // 20 commandes / minute / IP

export function isOrderAppRateLimited(identifier: string): boolean {
  return orderAppLimiter.isLimited(identifier);
}
export function recordOrderAppAttempt(identifier: string): void {
  orderAppLimiter.record(identifier);
}
