import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      {
        // S'applique à toutes les routes (pages et API).
        source: "/:path*",
        headers: [
          // Empêche l'affichage du site dans une iframe tierce (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Empêche le navigateur de deviner le type MIME d'une ressource.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Limite les informations envoyées dans l'en-tête Referer vers d'autres origines.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Désactive l'accès aux API sensibles du navigateur par défaut.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // Force HTTPS pendant 2 ans, y compris sous-domaines (n'a d'effet qu'en HTTPS).
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
