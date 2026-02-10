import { useMemo, useState } from "react";
import { usePipeline } from "./hooks/usePipeline";
import { TopBar, type AppTab } from "./components/TopBar";
import { Hero } from "./components/Hero";
import { Pipeline } from "./components/Pipeline";
import { ListeningDashboard } from "./components/ListeningDashboard";
import { ManageFunds } from "./components/ManageFunds";
import { PaymentPage } from "./components/PaymentPage";
import { ErrorToast } from "./components/ErrorToast";
import "./App.css";

function App() {
  // Check for ?pay= query parameter
  const payAddress = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const addr = params.get("pay");
    if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr;
    return null;
  }, []);

  // If this is a payment link, show the payment page (no auth needed)
  if (payAddress) {
    return <PaymentPage address={payAddress} />;
  }

  return <MainApp />;
}

/** The main app (wallet flow + pipeline / listening dashboard / manage funds) */
function MainApp() {
  const pipeline = usePipeline();
  const [activeTab, setActiveTab] = useState<AppTab>("overview");

  return (
    <div className="app">
      {/* Ambient glow */}
      <div className="bg-glow" aria-hidden="true" />

      {/* Progress bar — only shown on overview tab */}
      {activeTab === "overview" && (
        <div className="progress-track" aria-hidden="true">
          <div
            className="progress-fill"
            style={{ width: `${pipeline.progress}%` }}
          />
        </div>
      )}

      <TopBar
        authenticated={pipeline.authenticated}
        walletAddress={pipeline.embeddedWallet?.address}
        copied={pipeline.copied}
        onCopy={pipeline.handleCopyAddress}
        onLogout={pipeline.logout}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "overview" ? (
        <>
          <Hero
            authenticated={pipeline.authenticated}
            walletAddress={pipeline.embeddedWallet?.address}
            copied={pipeline.copied}
            onCopy={pipeline.handleCopyAddress}
          />

          {pipeline.isListening ? (
            <ListeningDashboard pipeline={pipeline} />
          ) : (
            <Pipeline pipeline={pipeline} />
          )}
        </>
      ) : (
        <ManageFunds />
      )}

      <ErrorToast error={pipeline.error} />
    </div>
  );
}

export default App;
