import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

export const runtime = "edge";

const BG = "#F7F8FA";
const CARD = "#FFFFFF";
const BORDER = "#E5E7EB";
const TEXT = "#111827";
const TEXT_SEC = "#6B7280";
const TEXT_MUTED = "#9CA3AF";
const PRIMARY = "#6366F1";
const PRIMARY_LIGHT = "#EEF2FF";
const MUTED = "#F1F3F5";

const CHAINS: [string, string][] = [
  ["Optimism", "#FF0420"],
  ["Base", "#0052FF"],
  ["Polygon", "#8247E5"],
  ["Arbitrum", "#12AAFF"],
];
const TOKENS = ["USDC", "USDT", "WETH"];

function truncAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const pay = searchParams.get("pay");
  const isPayment = pay && /^0x[a-fA-F0-9]{40}$/.test(pay);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BG,
          fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* Subtle radial glow */}
        <div
          style={{
            position: "absolute",
            top: "35%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "900px",
            height: "450px",
            background:
              "radial-gradient(ellipse, rgba(99,102,241,0.06) 0%, rgba(99,102,241,0.02) 40%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: isPayment ? "44px 56px" : "48px 64px",
            borderRadius: "20px",
            background: CARD,
            border: `1px solid ${BORDER}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            maxWidth: "88%",
            position: "relative",
          }}
        >
          {isPayment ? (
            /* ─── Payment link variant ─── */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0",
              }}
            >
              {/* Brand label */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "28px",
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    background: PRIMARY,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 16l-4-4 4-4M17 8l4 4-4 4"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: TEXT_MUTED,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Universal Deposit Address
                </span>
              </div>

              {/* "Send tokens to" */}
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: 500,
                  color: TEXT_SEC,
                  marginBottom: "10px",
                }}
              >
                Send tokens to
              </span>

              {/* Address */}
              <div
                style={{
                  display: "flex",
                  padding: "14px 32px",
                  borderRadius: "12px",
                  background: MUTED,
                  border: `1px solid ${BORDER}`,
                  marginBottom: "28px",
                }}
              >
                <span
                  style={{
                    fontSize: "38px",
                    fontWeight: 700,
                    color: TEXT,
                    letterSpacing: "0.02em",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {truncAddr(pay)}
                </span>
              </div>

              {/* Tokens */}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginBottom: "16px",
                }}
              >
                {TOKENS.map((t) => (
                  <div
                    key={t}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "7px 20px",
                      borderRadius: "100px",
                      background: PRIMARY_LIGHT,
                      fontSize: "15px",
                      fontWeight: 600,
                      color: PRIMARY,
                    }}
                  >
                    {t}
                  </div>
                ))}
              </div>

              {/* Chains */}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                }}
              >
                {CHAINS.map(([name, color]) => (
                  <div
                    key={name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: TEXT_SEC,
                    }}
                  >
                    <div
                      style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: color,
                        display: "flex",
                      }}
                    />
                    {name}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ─── Homepage variant ─── */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0",
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  background: PRIMARY,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "24px",
                }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M7 16l-4-4 4-4M17 8l4 4-4 4"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Title */}
              <span
                style={{
                  fontSize: "40px",
                  fontWeight: 700,
                  color: TEXT,
                  letterSpacing: "-0.03em",
                  textAlign: "center",
                  lineHeight: 1.15,
                  marginBottom: "14px",
                }}
              >
                Universal Deposit Address
              </span>

              {/* Description */}
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: 400,
                  color: TEXT_SEC,
                  textAlign: "center",
                  lineHeight: 1.55,
                  maxWidth: "560px",
                  marginBottom: "32px",
                }}
              >
                Receive funds on any chain and have them automatically bridged
                to your destination.
              </span>

              {/* Chains */}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginBottom: "24px",
                }}
              >
                {CHAINS.map(([name, color]) => (
                  <div
                    key={name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      padding: "8px 18px",
                      borderRadius: "100px",
                      background: MUTED,
                      border: `1px solid ${BORDER}`,
                      fontSize: "14px",
                      fontWeight: 500,
                      color: TEXT_SEC,
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: color,
                        display: "flex",
                      }}
                    />
                    {name}
                  </div>
                ))}
              </div>

              {/* Powered by */}
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 400,
                  color: TEXT_MUTED,
                }}
              >
                Powered by{" "}
                <span style={{ fontWeight: 600, color: TEXT_SEC }}>
                  Biconomy
                </span>{" "}
                &{" "}
                <span style={{ fontWeight: 600, color: TEXT_SEC }}>Across</span>
              </span>
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
