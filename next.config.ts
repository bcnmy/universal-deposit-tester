import type { NextConfig } from "next";

// ── Content Security Policy ───────────────────────────────────────────
// Based on Privy CSP guidance: https://docs.privy.io/guides/security/content-security-policy
const isDev = process.env.NODE_ENV === "development";

const cspDirectives = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'", // Next.js injects inline bootstrap scripts
    ...(isDev ? ["'unsafe-eval'"] : []), // Next.js HMR / React Fast Refresh
    "https://challenges.cloudflare.com",
  ],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "child-src": [
    "https://auth.privy.io",
    "https://verify.walletconnect.com",
    "https://verify.walletconnect.org",
  ],
  "frame-src": [
    "https://auth.privy.io",
    "https://verify.walletconnect.com",
    "https://verify.walletconnect.org",
    "https://challenges.cloudflare.com",
  ],
  "connect-src": [
    "'self'",
    // Privy & WalletConnect
    "https://auth.privy.io",
    "wss://relay.walletconnect.com",
    "wss://relay.walletconnect.org",
    "wss://www.walletlink.org",
    "https://*.rpc.privy.systems",
    "https://explorer-api.walletconnect.com",
    // Alchemy RPC (client-side via NEXT_PUBLIC_RPC_* transports)
    "https://*.g.alchemy.com",
    // Biconomy MEE bundler
    "https://*.biconomy.io",
    // PostHog UI host (data flows through /ingest proxy → 'self')
    "https://us.posthog.com",
  ],
  "worker-src": ["'self'"],
  "manifest-src": ["'self'"],
};

const cspHeader = Object.entries(cspDirectives)
  .map(([key, values]) => `${key} ${values.join(" ")}`)
  .join("; ");

// ── Security Headers ──────────────────────────────────────────────────
// https://docs.privy.io/security/implementation-guide/security-checklist
const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "interest-cohort=()",
    ].join(", "),
  },
];

// ── Next.js Config ────────────────────────────────────────────────────
const nextConfig: NextConfig = {
  serverExternalPackages: ["@biconomy/abstractjs"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
