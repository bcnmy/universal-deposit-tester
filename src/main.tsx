import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { optimism, base, polygon, arbitrum } from "viem/chains";
import App from "./App.tsx";
import "./index.css";

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;

if (!privyAppId) {
  throw new Error("VITE_PRIVY_APP_ID is required. Copy .env.example to .env and fill in your Privy App ID.");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: "dark",
        },
        supportedChains: [optimism, base, polygon, arbitrum],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users",
          },
          showWalletUIs: false,
        },
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>
);
