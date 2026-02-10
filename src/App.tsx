import { usePipeline } from "./hooks/usePipeline";
import { TopBar } from "./components/TopBar";
import { Hero } from "./components/Hero";
import { Pipeline } from "./components/Pipeline";
import { ErrorToast } from "./components/ErrorToast";
import "./App.css";

function App() {
  const pipeline = usePipeline();

  return (
    <div className="app">
      {/* Ambient glow */}
      <div className="bg-glow" aria-hidden="true" />

      {/* Progress bar */}
      <div className="progress-track" aria-hidden="true">
        <div
          className="progress-fill"
          style={{ width: `${pipeline.progress}%` }}
        />
      </div>

      <TopBar
        authenticated={pipeline.authenticated}
        walletAddress={pipeline.embeddedWallet?.address}
        copied={pipeline.copied}
        onCopy={pipeline.handleCopyAddress}
        onLogout={pipeline.logout}
      />

      <Hero
        authenticated={pipeline.authenticated}
        walletAddress={pipeline.embeddedWallet?.address}
        copied={pipeline.copied}
        onCopy={pipeline.handleCopyAddress}
      />

      <Pipeline pipeline={pipeline} />

      <ErrorToast error={pipeline.error} />
    </div>
  );
}

export default App;
