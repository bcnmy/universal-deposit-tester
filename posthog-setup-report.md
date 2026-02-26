<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Universal Deposit Address project. Here is a summary of all changes made:

## What was set up

- **`instrumentation-client.ts`** *(new)* — Client-side PostHog initialization using the Next.js 15.3+ `instrumentation-client` pattern. Enables automatic exception capture, session replay, and reverse-proxy ingestion via `/ingest`.
- **`src/lib/posthog-server.ts`** *(new)* — Singleton server-side PostHog client (using `posthog-node`) for capturing events from API routes and the cron poller.
- **`next.config.ts`** *(edited)* — Added PostHog reverse proxy rewrites (`/ingest → us.i.posthog.com`) and `skipTrailingSlashRedirect: true` to avoid ad-blocker interference.
- **`.env.local`** *(updated)* — `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` set securely via env file (not hardcoded).
- **`src/hooks/usePipeline.ts`** *(edited)* — Added `posthog.identify()` on wallet connect and 7 event captures covering the full setup pipeline and session lifecycle.
- **`src/components/steps/SelectDestinationStep.tsx`** *(edited)* — Added `destination_confirmed` capture when the user clicks Continue with their chain/recipient selection.
- **`src/app/api/sessions/register/route.ts`** *(edited)* — Added server-side `session_registered` event so server-client correlation is maintained.
- **`src/lib/pollAndBridge.ts`** *(edited)* — Added server-side `bridge_executed` and `bridge_failed` events for every cron poll outcome.

## Events instrumented

| Event | Description | File |
|-------|-------------|------|
| `wallet_connected` | User authenticates via Privy and an embedded wallet is provisioned | `src/hooks/usePipeline.ts` |
| `destination_confirmed` | User confirms destination chain, recipient address, and output token | `src/components/steps/SelectDestinationStep.tsx` |
| `session_setup_completed` | Full pipeline completes and server-side monitoring begins | `src/hooks/usePipeline.ts` |
| `session_setup_failed` | Any setup step fails (sign auth, nexus init, install module, grant permission) | `src/hooks/usePipeline.ts` |
| `session_reconfigured` | User changes destination chain or recipient from the listening dashboard | `src/hooks/usePipeline.ts` |
| `session_deleted` | User disables their deposit address session | `src/hooks/usePipeline.ts` |
| `deposit_address_copied` | User copies their deposit wallet address to clipboard | `src/hooks/usePipeline.ts` |
| `session_registered` | Server-side: wallet session registered for background monitoring | `src/app/api/sessions/register/route.ts` |
| `bridge_executed` | Server-side: a bridge or forward transfer was successfully executed | `src/lib/pollAndBridge.ts` |
| `bridge_failed` | Server-side: a bridge or forward transfer attempt failed | `src/lib/pollAndBridge.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- 📊 **Dashboard — Analytics basics**: https://us.posthog.com/project/290743/dashboard/1311472
- 🔁 **Setup Conversion Funnel** (wallet connected → destination confirmed → setup completed): https://us.posthog.com/project/290743/insights/obgeGXjw
- 🌉 **Bridge Activity (Success vs Failure)** (daily bridge volumes): https://us.posthog.com/project/290743/insights/RwozOB8d
- ⚠️ **Session Setup Failures by Step** (which step causes the most drop-off): https://us.posthog.com/project/290743/insights/1Uut0RHU
- 📉 **Session Churn — Deletions & Reconfigurations** (churn signals): https://us.posthog.com/project/290743/insights/WwtjT8xG
- 👛 **New Wallets Connected (DAU)** (user acquisition proxy): https://us.posthog.com/project/290743/insights/aDcgZ7Bb

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/posthog-integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
