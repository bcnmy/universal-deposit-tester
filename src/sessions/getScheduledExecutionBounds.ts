const WINDOW_MINUTES = 1;

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Immediate-start execution bounds with a 5-minute window (timestamps in seconds).
 *
 * Spread into any `getQuote` call or instruction:
 * ```ts
 * { ...ScheduledExecutionBounds }
 * ```
 */
export const ScheduledExecutionBounds = {
  get lowerBoundTimestamp() {
    return nowSeconds();
  },
  get upperBoundTimestamp() {
    return nowSeconds() + WINDOW_MINUTES * 60;
  },
};
