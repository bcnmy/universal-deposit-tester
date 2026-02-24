import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

export const runtime = "edge";

// Static font files bundled at build time — no runtime network requests
const outfitRegular = fetch(
  new URL("./fonts/Outfit-Regular.ttf", import.meta.url),
).then((r) => r.arrayBuffer());

const outfitBold = fetch(
  new URL("./fonts/Outfit-Bold.ttf", import.meta.url),
).then((r) => r.arrayBuffer());

const jetbrainsMedium = fetch(
  new URL("./fonts/JetBrainsMono-Medium.ttf", import.meta.url),
).then((r) => r.arrayBuffer());

// ── Design tokens (mirrors the app's CSS variables) ────
const BG = "#F7F8FA";
const TEXT = "#111827";
const TEXT_SEC = "#6B7280";
const TEXT_MUTED = "#9CA3AF";
const PRIMARY = "#6366F1";
const PRIMARY_LIGHT = "#EEF2FF";
const BORDER = "#E5E7EB";

const CHAINS: [name: string, color: string][] = [
  ["Optimism", "#FF0420"],
  ["Base", "#0052FF"],
  ["Polygon", "#8247E5"],
  ["Arbitrum", "#12AAFF"],
];

const TOKENS = ["USDC", "USDT", "WETH"];

function truncAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// ── Shared visual elements ─────────────────────────────

function ChainBar({ width = 220 }: { width?: number }) {
  return (
    <div
      style={{
        display: "flex",
        width: `${width}px`,
        height: "5px",
        borderRadius: "3px",
        overflow: "hidden",
      }}
    >
      {CHAINS.map(([n, c], i) => (
        <div
          key={n}
          style={{
            flex: 1,
            background: c,
            borderRadius:
              i === 0
                ? "3px 0 0 3px"
                : i === CHAINS.length - 1
                  ? "0 3px 3px 0"
                  : "0",
            display: "flex",
          }}
        />
      ))}
    </div>
  );
}

function BrandIcon({ size = 40 }: { size?: number }) {
  const svg = Math.round(size * 0.55);
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${Math.round(size * 0.275)}px`,
        background: PRIMARY,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        width={svg}
        height={svg}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M7 16l-4-4 4-4M17 8l4 4-4 4"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function ChainDots({ gap = 18, size = 14 }: { gap?: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: `${gap}px` }}>
      {CHAINS.map(([name, color]) => (
        <div
          key={name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            fontSize: `${size}px`,
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
  );
}

// ── Homepage variant ───────────────────────────────────

function HomepageImage() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: `linear-gradient(145deg, ${BG} 0%, #F0F1F5 100%)`,
        fontFamily: "Outfit",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient indigo glow — matches the app's .bg-glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "35%",
          transform: "translate(-50%, -50%)",
          width: "800px",
          height: "420px",
          background:
            "radial-gradient(ellipse, rgba(99,102,241,0.05) 0%, transparent 70%)",
          display: "flex",
        }}
      />

      {/* Abstract chain-color orbs — right-side composition */}
      <div
        style={{
          position: "absolute",
          top: "-10px",
          right: "60px",
          width: "300px",
          height: "300px",
          borderRadius: "50%",
          background: "rgba(255,4,32,0.07)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "200px",
          right: "-30px",
          width: "360px",
          height: "360px",
          borderRadius: "50%",
          background: "rgba(0,82,255,0.06)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50px",
          right: "260px",
          width: "250px",
          height: "250px",
          borderRadius: "50%",
          background: "rgba(130,71,229,0.065)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "320px",
          right: "100px",
          width: "280px",
          height: "280px",
          borderRadius: "50%",
          background: "rgba(18,170,255,0.06)",
          display: "flex",
        }}
      />

      {/* Content — left-aligned editorial layout */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 0 0 80px",
          position: "relative",
          height: "100%",
          maxWidth: "700px",
        }}
      >
        {/* Icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "32px",
          }}
        >
          <BrandIcon size={42} />
        </div>

        {/* Title — two lines for typographic impact */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginBottom: "22px",
          }}
        >
          <span
            style={{
              fontSize: "56px",
              fontWeight: 700,
              color: TEXT,
              letterSpacing: "-0.045em",
              lineHeight: 1.05,
            }}
          >
            Universal
          </span>
          <span
            style={{
              fontSize: "56px",
              fontWeight: 700,
              color: TEXT,
              letterSpacing: "-0.045em",
              lineHeight: 1.05,
            }}
          >
            Deposit Address
          </span>
        </div>

        {/* Chain gradient bar — the signature accent */}
        <div style={{ display: "flex", marginBottom: "26px" }}>
          <ChainBar width={240} />
        </div>

        {/* Description */}
        <span
          style={{
            fontSize: "19px",
            fontWeight: 400,
            color: TEXT_SEC,
            lineHeight: 1.55,
            marginBottom: "40px",
            maxWidth: "440px",
          }}
        >
          Receive funds on any supported chain. Automatically
          bridged to your destination.
        </span>

        {/* Chain labels */}
        <ChainDots />
      </div>

      {/* Credit — bottom-right */}
      <div
        style={{
          position: "absolute",
          bottom: "28px",
          right: "40px",
          display: "flex",
          alignItems: "center",
          gap: "5px",
          fontSize: "13px",
          fontWeight: 400,
          color: TEXT_MUTED,
        }}
      >
        <span>Powered by</span>
        <span style={{ fontWeight: 600, color: TEXT_SEC }}>Biconomy</span>
        <span>×</span>
        <span style={{ fontWeight: 600, color: TEXT_SEC }}>Across</span>
      </div>
    </div>
  );
}

// ── Payment-link variant ───────────────────────────────

function PaymentImage({ address }: { address: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(145deg, ${BG} 0%, #F0F1F5 100%)`,
        fontFamily: "Outfit",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle corner orbs */}
      <div
        style={{
          position: "absolute",
          top: "-80px",
          right: "-50px",
          width: "340px",
          height: "340px",
          borderRadius: "50%",
          background: "rgba(0,82,255,0.045)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-100px",
          left: "-60px",
          width: "300px",
          height: "300px",
          borderRadius: "50%",
          background: "rgba(130,71,229,0.04)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "40px",
          left: "80px",
          width: "200px",
          height: "200px",
          borderRadius: "50%",
          background: "rgba(255,4,32,0.03)",
          display: "flex",
        }}
      />

      {/* Brand badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "40px",
        }}
      >
        <BrandIcon size={30} />
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

      {/* Label */}
      <span
        style={{
          fontSize: "16px",
          fontWeight: 500,
          color: TEXT_SEC,
          marginBottom: "14px",
          letterSpacing: "0.02em",
        }}
      >
        Send tokens to
      </span>

      {/* Address — hero element */}
      <div
        style={{
          display: "flex",
          padding: "16px 36px",
          background: "white",
          border: `1.5px solid ${BORDER}`,
          borderRadius: "16px",
          marginBottom: "28px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <span
          style={{
            fontFamily: "JetBrains Mono",
            fontSize: "46px",
            fontWeight: 500,
            color: TEXT,
            letterSpacing: "0.04em",
          }}
        >
          {truncAddr(address)}
        </span>
      </div>

      {/* Chain gradient bar */}
      <div style={{ display: "flex", marginBottom: "32px" }}>
        <ChainBar width={200} />
      </div>

      {/* Tokens + chains row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "24px",
        }}
      >
        {/* Token pills */}
        <div style={{ display: "flex", gap: "8px" }}>
          {TOKENS.map((t) => (
            <div
              key={t}
              style={{
                display: "flex",
                padding: "7px 18px",
                borderRadius: "100px",
                background: PRIMARY_LIGHT,
                fontSize: "14px",
                fontWeight: 600,
                color: PRIMARY,
              }}
            >
              {t}
            </div>
          ))}
        </div>

        {/* Separator */}
        <div
          style={{
            width: "1px",
            height: "22px",
            background: BORDER,
            display: "flex",
          }}
        />

        {/* Chain dots */}
        <ChainDots gap={14} size={13} />
      </div>
    </div>
  );
}

// ── Handler ────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const [regular, bold, mono] = await Promise.all([
    outfitRegular,
    outfitBold,
    jetbrainsMedium,
  ]);

  const { searchParams } = request.nextUrl;
  const pay = searchParams.get("pay");
  const isPayment = pay && /^0x[a-fA-F0-9]{40}$/.test(pay);

  return new ImageResponse(
    isPayment ? <PaymentImage address={pay} /> : <HomepageImage />,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Outfit", data: regular, weight: 400, style: "normal" },
        { name: "Outfit", data: bold, weight: 700, style: "normal" },
        { name: "JetBrains Mono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
