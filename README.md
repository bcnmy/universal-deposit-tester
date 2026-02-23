# Universal Deposit Address

Automated cross-chain token bridging using **Biconomy Smart Sessions** (EIP-7702) and **Across Protocol V3**. Users connect a Privy embedded wallet, delegate it to a Nexus smart account, grant session permissions, and the server continuously polls for incoming deposits and bridges them to a chosen destination chain.

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Entry — renders <App /> (SSR disabled)
│   ├── layout.tsx              # Root layout
│   ├── providers.tsx           # PrivyProvider (embedded wallets, supported chains)
│   ├── admin/page.tsx          # Admin panel UI
│   └── api/
│       ├── sessions/
│       │   ├── register/route.ts       # POST   — register a session
│       │   └── [address]/route.ts      # GET / PATCH / DELETE a session
│       ├── cron/poll/route.ts          # GET — Vercel Cron: poll & bridge
│       └── admin/sessions/route.ts     # GET / DELETE — admin (sig-gated)
│
├── components/                 # React UI components
│   ├── Pipeline.tsx            # Setup pipeline (steps 1–6)
│   ├── ListeningDashboard.tsx  # Post-setup monitoring dashboard
│   ├── PaymentPage.tsx         # Public payment link (?pay=0x…)
│   ├── ManageFunds.tsx         # Fund management tab
│   └── steps/                  # Individual pipeline step cards
│       ├── ConnectWalletStep.tsx
│       ├── SelectDestinationStep.tsx
│       ├── SignAuthorizationStep.tsx
│       ├── InitializeNexusStep.tsx
│       ├── InstallSessionsStep.tsx
│       ├── GrantPermissionStep.tsx
│       └── ...
│
├── hooks/
│   ├── usePipeline.ts          # All pipeline state, handlers, auto-advance
│   └── useManageFunds.ts       # Fund management logic
│
├── sessions/                   # Session setup & execution logic
│   ├── createSessionSigner.ts  # Generate or restore a session keypair
│   ├── createSmartSessionModule.ts  # Wrap signer into a SmartSessions module
│   ├── createSessionMeeClient.ts    # Build multichain Nexus account + MEE client
│   ├── installSessionModule.ts      # Install the sessions module on-chain
│   ├── grantDepositV3Permission.ts  # Sign the typed-data permission grant
│   ├── buildDepositV3Actions.ts     # Build per-chain action descriptors
│   ├── executeDepositV3.ts          # Execute an Across depositV3 bridge (server)
│   ├── executeForwardTransfer.ts    # Execute an ERC-20 transfer (server)
│   ├── getScheduledExecutionBounds.ts # Timestamp bounds for supertxs
│   ├── sessionStore.ts         # Dual-layer storage (localStorage + server API)
│   └── types.ts                # SessionDetails type
│
├── lib/                        # Server-side utilities
│   ├── db.ts                   # Upstash Redis storage (session CRUD)
│   ├── encrypt.ts              # AES-256-GCM encryption for session keys at rest
│   ├── pollAndBridge.ts        # Core polling loop — balance check → bridge/forward
│   ├── bigintJson.ts           # JSON serialisation preserving BigInt values
│   └── log.ts                  # Coloured logging helpers
│
├── config.ts                   # Chains, tokens, contract addresses, env RPC URLs
├── constants.ts                # UI metadata (chain colours, step themes)
├── types.ts                    # Shared UI types (Status, StepStatus)
└── utils.ts                    # Formatting & derivation helpers

scripts/
└── local-cron.mjs              # Local dev replacement for Vercel Cron

vercel.json                     # Cron schedule: /api/cron/poll every minute
```

## Setup Pipeline (Client-Side)

The `usePipeline` hook orchestrates six auto-advancing steps. Each step triggers the next on success.

### Step 1 — Connect Wallet

Privy creates an **embedded wallet** (EOA) on login. No external wallet required.

### Step 2 — Select Destination

User picks a destination chain (Optimism, Base, Polygon, or Arbitrum) and an optional custom recipient address. If recipient is "self", bridged funds stay in the user's wallet on the destination chain.

### Step 3 — Sign EIP-7702 Authorization

**What is signed:** An EIP-7702 authorization that delegates the user's EOA to the **Nexus singleton** (`0x00000000383e8cBe298514674Ea60Ee1d1de50ac`) with `chainId: 0` (valid on all chains).

**Who signs:** The user's Privy embedded wallet via `useSign7702Authorization`.

**Effect:** The EOA becomes a smart account (Nexus) on every supported chain once the authorization is propagated on-chain.

### Step 4 — Initialize Nexus Account

Builds a `MultichainNexusAccount` and a `MeeClient` using the user's Privy provider. The MEE client is configured for all supported chains (Optimism, Base, Polygon, Arbitrum) with version `V2_1_0`.

No signing occurs; this is client-side object construction.

### Step 5 — Install Smart Sessions Module + Propagate 7702

A **session signer** keypair is generated (or restored from localStorage). The public key becomes the `redeemer` for future permission grants. The private key is persisted locally and later sent to the server.

The SmartSessions validator module is installed via `prepareForPermissions`. The **7702 authorization from Step 3** is piggybacked into this same supertransaction (`multichain7702Auth: true`), so the delegation is activated on all chains in a single step.

**What is signed:** The MEE supertransaction that installs the sessions module and propagates the 7702 delegation. Signed by the user's Privy wallet (the MEE client uses the user's provider as signer).

### Step 6 — Grant depositV3 Permission

**What is signed:** A **typed-data** (EIP-712) permission grant via `grantPermissionTypedDataSign`. This is the core session permission.

**Who signs:** The user's Privy wallet (owner of the Nexus account).

**Granted permissions (per supported chain):**

| Action | Target | Selector | Policy |
|---|---|---|---|
| `approve` | Each token address (USDC, USDT, WETH) | `0x095ea7b3` | Sudo |
| `depositV3` | Across SpokePool | `0xe7a7ed02` | Sudo |

The `redeemer` is the session signer's address (from Step 5). The fee token is USDC on Arbitrum (max 2 USDC).

The returned `sessionDetails` object is the proof that the session signer is authorized to execute these actions. It is saved to localStorage **and** sent to the server.

### Post-Setup — Server Registration

After Step 6 completes, the client calls `POST /api/sessions/register` with:
- `walletAddress` — the user's EOA
- `sessionPrivateKey` — the session signer's private key (encrypted at rest with AES-256-GCM)
- `sessionSignerAddress` — the session signer's public address
- `sessionDetails` — the typed-data grant result (contains BigInts serialised as `__bigint:…`)
- `listeningConfig` — `{ destChainId, recipientIsSelf, recipientAddr }`
- `sessionVersion` — bumped when permission scope changes (invalidates old sessions)

## Session Structure

### SessionDetails (from Biconomy)

Returned by `grantPermissionTypedDataSign`. Contains the EIP-712 typed-data signature, the permission ID, the list of granted actions, and chain-specific enable data. This is opaque to the app — it is passed directly to `usePermission` when executing.

### SessionRecord (stored in Redis)

```
session:<walletAddress> → {
  walletAddress: string,
  encryptedKey: string,            // AES-256-GCM encrypted session private key
  sessionSignerAddress: string,
  sessionDetails: object,          // BigInts as "__bigint:…"
  listeningConfig: {
    destChainId: number,
    recipientIsSelf: boolean,
    recipientAddr: string,
  },
  sessionVersion: number,
  registeredAt: string,            // ISO timestamp
  lastPollAt: string | null,
  active: boolean,
}
```

Redis also maintains a SET at `sessions:active` with all actively-monitored wallet addresses.

### Local Storage (client-side cache)

Three keys per wallet (prefixed `nexus_session:<address>:`):
- `key` — session signer private key (hex)
- `details` — versioned envelope `{ version, details: SessionDetails }` (BigInt-safe JSON)
- `listening` — `{ destChainId, recipientIsSelf, recipientAddr }`

On page load, the client restores from localStorage for instant UI hydration, then verifies against the server. If the server no longer has the session, local state is cleared.

## Server-Side Monitoring (Cron)

### Flow

1. **Vercel Cron** hits `GET /api/cron/poll` every minute (protected by `CRON_SECRET`).
2. `pollAllSessions()` fetches all addresses from the `sessions:active` Redis SET.
3. For each wallet:
   - Determines **watched chains** = all supported chains except the destination. If recipient ≠ self, the destination chain is also watched (for forwarding).
   - Reads ERC-20 balances (USDC, USDT, WETH) on every watched chain via `balanceOf`.
   - If a balance exceeds the minimum threshold (0.1 USDC/USDT, 0.00001 WETH), a deposit is detected.
4. On deposit detection:
   - The session private key is **decrypted** from Redis.
   - A server-side MEE client is built using the session signer (not the user's wallet).
   - `checkEnabledPermissions` determines if the permission is already enabled on-chain → uses `USE` mode (cheaper) or `ENABLE_AND_USE`.
   - **If deposit is on a source chain:** `executeDepositV3` calls `approve` + `depositV3` on the Across SpokePool via `usePermission`. The supertransaction is gas-sponsored.
   - **If deposit is on the destination chain and recipient ≠ self:** `executeForwardTransfer` calls `transfer` to move tokens to the recipient.

### Local Cron (Development)

`scripts/local-cron.mjs` replaces Vercel Cron locally. It polls `http://localhost:3000/api/cron/poll` on a configurable interval (default 10s for dev, 60s for prod).

```bash
npm run dev:cron    # polls every 60s
npm run dev:full    # starts Next.js + cron together
```

## API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/sessions/register` | None | Register a wallet for server-side monitoring |
| `GET` | `/api/sessions/[address]` | None | Check registration status |
| `PATCH` | `/api/sessions/[address]` | None | Update config (listeningConfig, active, etc.) |
| `DELETE` | `/api/sessions/[address]` | None | Stop monitoring and delete session |
| `GET` | `/api/cron/poll` | `CRON_SECRET` | Trigger a poll cycle (Vercel Cron) |
| `GET` | `/api/admin/sessions` | Admin signature | List all sessions |
| `DELETE` | `/api/admin/sessions?address=` | Admin signature | Delete a specific session |

Admin endpoints require an `x-admin-signature` header — an EIP-191 personal sign from the hardcoded admin address, with a timestamp that must be within 5 minutes.

## Signing Summary

| Step | What is Signed | Signer | Standard |
|---|---|---|---|
| 3 | EIP-7702 authorization (delegate EOA → Nexus) | User (Privy wallet) | EIP-7702 |
| 5 | Supertransaction: install sessions module + propagate 7702 | User (Privy wallet) | MEE supertx |
| 6 | Permission grant (approve + depositV3 on all chains) | User (Privy wallet) | EIP-712 typed data |
| Cron | Bridge execution via `usePermission` | Session signer (server-side) | MEE supertx |
| Admin | Admin panel access | Admin EOA | EIP-191 personal sign |

## Key Dependencies

- **@biconomy/abstractjs** — Nexus smart accounts, MEE client, smart sessions
- **@privy-io/react-auth** — Embedded wallets, EIP-7702 authorization signing
- **@upstash/redis** — Serverless Redis for session persistence
- **viem** — Ethereum client library (ABI encoding, contract reads, signing)
- **next** — App Router, API routes, Vercel Cron integration

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Client | Privy application ID |
| `NEXT_PUBLIC_BICONOMY_API_KEY` | Client + Server | Biconomy MEE service API key |
| `NEXT_PUBLIC_RPC_BASE` | Client + Server | RPC URL for Base |
| `NEXT_PUBLIC_RPC_OPTIMISM` | Client + Server | RPC URL for Optimism |
| `NEXT_PUBLIC_RPC_POLYGON` | Client + Server | RPC URL for Polygon |
| `NEXT_PUBLIC_RPC_ARBITRUM` | Client + Server | RPC URL for Arbitrum |
| `NEXT_PUBLIC_RPC_ETHEREUM` | Client + Server | RPC URL for Ethereum mainnet |
| `NEXT_PUBLIC_RPC_BNB` | Client + Server | RPC URL for BNB Chain |
| `KV_REST_API_URL` | Server | Upstash Redis URL (auto-injected by Vercel) |
| `KV_REST_API_TOKEN` | Server | Upstash Redis token (auto-injected by Vercel) |
| `SESSION_ENCRYPTION_KEY` | Server | 64-char hex string (32 bytes) for AES-256-GCM |
| `CRON_SECRET` | Server | Bearer token protecting the cron endpoint |

## Supported Chains & Tokens

**Chains:** Optimism, Base, Polygon, Arbitrum

**Tokens:** USDC, USDT, WETH (each with per-chain addresses defined in `config.ts`)

**Bridge:** Across Protocol V3 SpokePool contracts (per-chain addresses in `config.ts`)
