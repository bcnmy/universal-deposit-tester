import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from "viem/accounts";

export type SessionSetupResult = {
  sessionSigner: PrivateKeyAccount;
  sessionPrivateKey: `0x${string}`;
};

/**
 * Creates a session signer. If an existing private key is supplied it is
 * re-used, otherwise a fresh one is generated.
 *
 * Later the key will live on a backend — for now we persist it in
 * localStorage (see sessionStore.ts).
 */
export function createSessionSigner(
  existingKey?: `0x${string}`,
): SessionSetupResult {
  const sessionPrivateKey = existingKey ?? generatePrivateKey();
  const sessionSigner = privateKeyToAccount(sessionPrivateKey);
  return { sessionSigner, sessionPrivateKey };
}
