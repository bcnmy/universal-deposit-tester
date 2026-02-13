"use client";

import dynamic from "next/dynamic";

// Import App with SSR disabled — it relies on browser APIs (localStorage,
// window.location, Privy hooks) that don't exist during static generation.
const App = dynamic(() => import("../App"), { ssr: false });

export default function Page() {
  return <App />;
}
