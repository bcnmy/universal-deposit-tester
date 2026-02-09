import { toSmartSessionsModule } from "@biconomy/abstractjs";
import type { PrivateKeyAccount } from "viem/accounts";

export function createSmartSessionModule(signer: PrivateKeyAccount) {
  return toSmartSessionsModule({ signer });
}

