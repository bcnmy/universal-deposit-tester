import type { Metadata } from "next";
import ClientPage from "./ClientPage";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const params = await searchParams;
  const pay = typeof params.pay === "string" ? params.pay : undefined;
  const isPayment = pay && /^0x[a-fA-F0-9]{40}$/.test(pay);

  if (isPayment) {
    const title = `Send tokens to ${truncateAddress(pay)}`;
    const description =
      "Send USDC, USDT, or WETH on Optimism, Base, Polygon, or Arbitrum. Deposits are automatically bridged to the recipient.";

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        images: [
          {
            url: `/api/og?pay=${pay}`,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [`/api/og?pay=${pay}`],
      },
    };
  }

  return {};
}

export default function Page() {
  return <ClientPage />;
}
