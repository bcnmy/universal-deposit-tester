import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";

/* ── Styles ─────────────────────────────────────────────────────────── */
import "./globals.css"; // Google Fonts import
import "../index.css"; // CSS reset + base variables
import "../App.css"; // Component styles

/* ── Metadata ───────────────────────────────────────────────────────── */
export const metadata: Metadata = {
  title: "Universal Deposit Address",
  description:
    "Auto-bridge deposits across chains using Biconomy smart sessions",
  icons: {
    icon: [
      { url: "/images/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/images/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/images/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
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

