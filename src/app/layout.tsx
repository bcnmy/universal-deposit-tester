import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";

/* ── Styles ─────────────────────────────────────────────────────────── */
import "./globals.css"; // Google Fonts import
import "../index.css"; // CSS reset + base variables
import "../App.css"; // Component styles

/* ── Metadata ───────────────────────────────────────────────────────── */
const SITE_TITLE = "Universal Deposit Address";
const SITE_DESCRIPTION =
  "Receive funds on any chain and have them automatically bridged to your destination. Powered by Biconomy & Across.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://universal-deposit-address.vercel.app",
  ),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  icons: {
    icon: [
      { url: "/images/logo.svg", type: "image/svg+xml" },
      { url: "/images/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/images/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/images/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: SITE_TITLE,
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: SITE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/api/og"],
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F8FA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

