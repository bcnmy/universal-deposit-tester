import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow long-running serverless functions for the cron poll route
  serverExternalPackages: ["@biconomy/abstractjs"],
};

export default nextConfig;


