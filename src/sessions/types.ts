import { meeSessionActions } from "@biconomy/abstractjs";

export type SessionDetails = Awaited<
  ReturnType<
    ReturnType<typeof meeSessionActions>["grantPermissionTypedDataSign"]
  >
>;

