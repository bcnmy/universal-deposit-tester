import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from "viem/accounts";

export type SessionSetupResult = {
  sessionSigner: PrivateKeyAccount;
  sessionPrivateKey: `0x${string}`;
};

export function createSessionSigner(): SessionSetupResult {
  const sessionPrivateKey = generatePrivateKey();
  const sessionSigner = privateKeyToAccount(sessionPrivateKey);
  return { sessionSigner, sessionPrivateKey };
}

