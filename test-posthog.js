// Simple test to verify PostHog is loading and working
// Run this in the browser console at http://localhost:3000

console.log("=== PostHog Debug Test ===");
console.log("1. Checking if posthog object exists...");
console.log("   posthog object:", typeof window.posthog !== 'undefined' ? '✓ Found' : '✗ Not found');

if (typeof window.posthog !== 'undefined') {
  console.log("2. PostHog initialized:", window.posthog.__loaded ? '✓ Yes' : '✗ No');
  console.log("3. PostHog config:", window.posthog.config);
  console.log("4. Debug mode:", window.posthog.config?.debug ? '✓ Enabled' : '✗ Disabled');
  
  console.log("\n5. Testing capture...");
  window.posthog.capture('test_event', { test: true });
  console.log("   ✓ Sent test_event");
  
  console.log("\n6. Recent PostHog activity:");
  console.log("   Check the console for [PostHog] prefixed messages");
} else {
  console.log("⚠️  PostHog not found! Check:");
  console.log("   - Is instrumentation-client.ts being loaded?");
  console.log("   - Are there any errors in the console?");
  console.log("   - Check Network tab for /ingest requests");
}

console.log("\n=== End of PostHog Debug Test ===");
