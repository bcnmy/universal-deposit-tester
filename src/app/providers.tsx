"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { optimism, base, polygon, arbitrum } from "viem/chains";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // During build / SSR the env var may not be available — render children
  // without the provider so static generation doesn't explode.
  if (!privyAppId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: { theme: "dark" },
        loginMethods: ["email", "passkey"],
        supportedChains: [optimism, base, polygon, arbitrum],
        embeddedWallets: {
          ethereum: { createOnLogin: "all-users" },
          showWalletUIs: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
