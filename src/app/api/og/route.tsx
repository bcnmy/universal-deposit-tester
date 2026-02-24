import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

export const runtime = "edge";

const CHAINS = ["Optimism", "Base", "Polygon", "Arbitrum"];
const CHAIN_COLORS = ["#FF0420", "#0052FF", "#8247E5", "#12AAFF"];
const TOKENS = ["USDC", "USDT", "WETH"];

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const payAddress = searchParams.get("pay");
  const isPaymentLink = payAddress && /^0x[a-fA-F0-9]{40}$/.test(payAddress);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Gradient orbs */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            right: "-80px",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-100px",
            left: "-60px",
            width: "350px",
            height: "350px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Main card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "48px 64px",
            borderRadius: "24px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            maxWidth: "90%",
          }}
        >
          {/* Logo / brand */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: isPaymentLink ? "24px" : "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              <svg width="44" height="44" viewBox="0 0 500 500" fill="none">
                <rect width="500" height="500" fill="#F2F7FF"/>
                <rect x="125" y="125" width="250" height="250" rx="48" fill="#6AAFE6"/>
                <path d="M193 198V257H150V272H193V287H186V305H217V287H210V272H290V287H283V305H314V287H307V272H350V257H307V198H290V257H210V198H193Z" fill="white"/>
              </svg>
            </div>
            <span
              style={{
                fontSize: "22px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.7)",
                letterSpacing: "-0.02em",
              }}
            >
              Universal Deposit Address
            </span>
          </div>

          {isPaymentLink ? (
            <>
              {/* Payment link variant */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <span
                  style={{
                    fontSize: "18px",
                    color: "rgba(255,255,255,0.5)",
                    fontWeight: 500,
                  }}
                >
                  Send tokens to
                </span>
                <div
                  style={{
                    display: "flex",
                    padding: "14px 28px",
                    borderRadius: "14px",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "32px",
                      fontWeight: 700,
                      color: "white",
                      letterSpacing: "0.02em",
                      fontFamily: "monospace",
                    }}
                  >
                    {truncateAddress(payAddress)}
                  </span>
                </div>
              </div>

              {/* Tokens */}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "24px",
                }}
              >
                {TOKENS.map((t) => (
                  <div
                    key={t}
                    style={{
                      display: "flex",
                      padding: "8px 18px",
                      borderRadius: "20px",
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.8)",
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
                  marginTop: "12px",
                }}
              >
                {CHAINS.map((c, i) => (
                  <div
                    key={c}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 14px",
                      borderRadius: "16px",
                      background: "rgba(255,255,255,0.05)",
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.6)",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: CHAIN_COLORS[i],
                        display: "flex",
                      }}
                    />
                    {c}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Default homepage variant */}
              <span
                style={{
                  fontSize: "42px",
                  fontWeight: 800,
                  color: "white",
                  textAlign: "center",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.15,
                  marginBottom: "16px",
                }}
              >
                One Address, Any Chain
              </span>
              <span
                style={{
                  fontSize: "20px",
                  color: "rgba(255,255,255,0.55)",
                  textAlign: "center",
                  maxWidth: "600px",
                  lineHeight: 1.5,
                }}
              >
                Receive funds on any chain and have them automatically bridged to
                your destination. Powered by Biconomy &amp; Across.
              </span>

              {/* Chains row */}
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  marginTop: "32px",
                }}
              >
                {CHAINS.map((c, i) => (
                  <div
                    key={c}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 18px",
                      borderRadius: "20px",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontSize: "16px",
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    <div
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: CHAIN_COLORS[i],
                        display: "flex",
                      }}
                    />
                    {c}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginTop: "28px",
            fontSize: "14px",
            color: "rgba(255,255,255,0.35)",
          }}
        >
          <span>Powered by Biconomy × Across</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
