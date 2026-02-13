# ERC-7739 & ERC-1271 Signature Validation Tutorial

This tutorial walks through two signature flows available with Nexus smart accounts:

1. **ERC-7739 Typed Data Signing** — used when the active validator module supports the ERC-7739 standard
2. **Vanilla ERC-1271 Signing** — the fallback when the module does *not* support ERC-7739

Both flows produce signatures that are verifiable on-chain via the `isValidSignature(bytes32, bytes)` interface defined in [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271).

---

## Prerequisites

- A deployed **Nexus smart account** (`nexusAccount` / `nexusClient`)
- A **test client** for on-chain reads (`testClient`)
- A **token contract with permit support** (`TokenWithPermit`)
- An **EOA signer** (`eoaAccount`) for the Ownable module example
- The following viem utilities imported:

```typescript
import {
  parseEther,
  parseAbi,
  parseAbiParameters,
  encodeAbiParameters,
  keccak256,
  concat,
  toBytes,
  hashMessage,
  domainSeparator,
  type Address
} from "viem"
```

---

## Flow 1 — ERC-7739 Typed Data Signing (Permit Example)

ERC-7739 enables smart accounts to sign EIP-712 typed data in a way that is natively verifiable on-chain. When the active validator module supports ERC-7739, `signTypedData` automatically uses this path.

### Step 1: Verify ERC-7739 Support

Before signing, confirm the current module supports ERC-7739:

```typescript
const version = await nexusAccount.getModule().erc7739VersionSupported()
// version !== 0 means ERC-7739 is supported
```

If `erc7739VersionSupported()` returns `0`, the module does **not** support ERC-7739 and the client will fall back to vanilla ERC-1271 (see Flow 2).

### Step 2: Define the EIP-712 Domain & Types

Set up the EIP-712 domain separator and type definitions for the `Permit` struct. This is the same structure that ERC-20 permit tokens expect:

```typescript
const appDomain = {
  chainId: chain.id,
  name: "TokenWithPermit",
  verifyingContract: TOKEN_WITH_PERMIT as Address,
  version: "1"
}

const primaryType = "Permit"

const types = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
}
```

### Step 3: Fetch the Current Nonce

Read the token contract's nonce for the smart account. This prevents replay attacks:

```typescript
const nonce = (await testClient.readContract({
  address: TOKEN_WITH_PERMIT as Address,
  abi: TokenWithPermitAbi,
  functionName: "nonces",
  args: [nexusAccountAddress]
})) as bigint
```

### Step 4: Build the Permit Message

Construct the typed data message with a deadline 1 hour in the future:

```typescript
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

const message = {
  owner: nexusAccountAddress,
  spender: nexusAccountAddress,
  value: parseEther("2"),
  nonce,
  deadline
}
```

### Step 5: Sign the Typed Data

Call `signTypedData` on the Nexus client. Because the active module supports ERC-7739, the signature is automatically wrapped in the ERC-7739 format:

```typescript
const finalSignature = await nexusClient.signTypedData({
  domain: appDomain,
  primaryType,
  types,
  message
})
```

### Step 6: Compute the Contents Hash (for verification)

To verify the signature on-chain, you need the **contents hash** — the standard EIP-712 hash of the typed data:

```typescript
// 1. Compute the EIP-712 domain separator
const appDomainSeparator = domainSeparator({ domain: appDomain })

// 2. Compute the struct hash of the Permit
const permitStructHash = keccak256(
  encodeAbiParameters(
    parseAbiParameters(
      "bytes32, address, address, uint256, uint256, uint256"
    ),
    [
      keccak256(
        toBytes(
          "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        )
      ),
      nexusAccountAddress,
      nexusAccountAddress,
      parseEther("2"),
      nonce,
      deadline
    ]
  )
)

// 3. Combine per EIP-712: hash = keccak256(0x1901 || domainSeparator || structHash)
const contentsHash = keccak256(
  concat(["0x1901", appDomainSeparator, permitStructHash])
)
```

### Step 7: Validate the Signature On-Chain

Call `isValidSignature` on the Nexus account to confirm the signature is valid:

```typescript
const nexusResponse = await testClient.readContract({
  address: nexusAccountAddress,
  abi: parseAbi([
    "function isValidSignature(bytes32,bytes) external view returns (bytes4)"
  ]),
  functionName: "isValidSignature",
  args: [contentsHash, finalSignature]
})

// A valid signature returns the EIP-1271 magic value
// nexusResponse === "0x1626ba7e"
```

The magic value `0x1626ba7e` is the `bytes4` selector of `isValidSignature(bytes32,bytes)`, which signals that the signature is valid.

### Step 8: Use the Signature (Permit Flow)

Submit the signature to the token contract's `permitWith1271` function to grant an ERC-20 allowance without a direct `approve` transaction:

```typescript
const permitTxHash = await nexusClient.writeContract({
  address: TOKEN_WITH_PERMIT as Address,
  abi: TokenWithPermitAbi,
  functionName: "permitWith1271",
  chain: network.chain,
  args: [
    nexusAccountAddress,   // owner
    nexusAccountAddress,   // spender
    parseEther("2"),       // value
    deadline,
    finalSignature
  ]
})

await nexusClient.waitForTransactionReceipt({ hash: permitTxHash })
```

### Step 9: Verify the Result

Confirm the allowance was set correctly:

```typescript
const allowance = await testClient.readContract({
  address: TOKEN_WITH_PERMIT as Address,
  abi: TokenWithPermitAbi,
  functionName: "allowance",
  args: [nexusAccountAddress, nexusAccountAddress]
})

// allowance === parseEther("2")
```

---

## Flow 2 — Vanilla ERC-1271 (Non-7739 Module)

When the active validator module does **not** support ERC-7739 (e.g., the Ownable module), signatures fall back to standard ERC-1271 validation. The signature includes the module address prepended to the raw ECDSA signature.

### Step 1: Create an Ownable Module

The Ownable module is a simple validator that does not implement ERC-7739:

```typescript
const ownableModule = toOwnableModule({
  signer: eoaAccount,
  threshold: 1,
  owners: [eoaAccount.address]
})
```

### Step 2: Verify the Module Does NOT Support ERC-7739

```typescript
const version = await ownableModule.erc7739VersionSupported()
// version === 0 → no ERC-7739 support
```

### Step 3: Install the Module on the Nexus Account

Install the Ownable module as a validator on the existing Nexus account:

```typescript
const userOpHash = await nexusClient.installModule({
  module: {
    type: "validator",
    address: ownableModule.module,
    initData: ownableModule.initData
  }
})

const receipt = await nexusClient.waitForUserOperationReceipt({
  hash: userOpHash
})
// receipt.success === true
```

### Step 4: Activate the Module

Set the newly installed module as the active module on the Nexus account:

```typescript
nexusAccount.setModule(ownableModule)

// Verify it's active
nexusAccount.getModule().module === ownableModule.module
```

### Step 5: Sign a Message

Sign a plain text message. Since the module doesn't support ERC-7739, the signature is produced in the vanilla ERC-1271 format:

```typescript
const message = "hello vanilla 1271"
const signature = await nexusAccount.signMessage({ message })
```

### Understanding the Signature Format

The vanilla ERC-1271 signature has the following structure:

| Component | Size | Description |
|-----------|------|-------------|
| Module address | 20 bytes (40 hex chars) | Identifies which validator module produced the signature |
| ECDSA signature | 65 bytes (130 hex chars) | The raw `r + s + v` signature |
| **Total** | **85 bytes (172 chars including `0x` prefix)** | |

```typescript
// signature.length === 172
// Breakdown: "0x" (2) + module address (40) + ECDSA sig (130) = 172
```

### Step 6: Validate the Signature On-Chain

Call `isValidSignature` on the Nexus account with the hashed message:

```typescript
const contractResponse = await testClient.readContract({
  address: nexusAccountAddress,
  abi: parseAbi([
    "function isValidSignature(bytes32,bytes) external view returns (bytes4)"
  ]),
  functionName: "isValidSignature",
  args: [hashMessage(message), signature]
})

// contractResponse === "0x1626ba7e" (EIP-1271 magic value)
```

The `hashMessage` function applies EIP-191 personal sign hashing (`"\x19Ethereum Signed Message:\n" + length + message`) before passing it to the contract.

---

## Key Differences: ERC-7739 vs Vanilla ERC-1271

| Aspect | ERC-7739 | Vanilla ERC-1271 |
|--------|----------|-------------------|
| **Module support** | Module must implement `erc7739VersionSupported() != 0` | Any validator module |
| **Typed data** | Native EIP-712 typed data signing | Plain message signing (EIP-191) |
| **Signature format** | ERC-7739 wrapped | Module address + raw ECDSA signature |
| **Use case** | Permit, off-chain order signing, gasless approvals | Simple message verification |
| **On-chain verification** | `isValidSignature(contentsHash, sig)` | `isValidSignature(hashMessage(msg), sig)` |

## Summary

- Use `nexusClient.signTypedData(...)` for EIP-712 typed data — the client automatically detects ERC-7739 support and wraps the signature accordingly.
- Use `nexusAccount.signMessage(...)` for plain messages — falls back to vanilla ERC-1271 when the module doesn't support ERC-7739.
- Both flows produce signatures that are verifiable on-chain via `isValidSignature`, returning the magic value `0x1626ba7e` on success.

