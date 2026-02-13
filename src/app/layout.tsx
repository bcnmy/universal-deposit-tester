import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";

/* ── Styles ─────────────────────────────────────────────────────────── */
import "./globals.css"; // Google Fonts import
import "../index.css"; // CSS reset + base variables
import "../App.css"; // Component styles

/* ── Metadata ───────────────────────────────────────────────────────── */
export const metadata: Metadata = {
  title: "Nexus Bridge",
  description:
    "Auto-bridge deposits across chains using Biconomy smart sessions",
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

