import { headers } from "next/headers";
import Script from "next/script";

export default async function Page() {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce");

  return <Script src="https://..." strategy="afterInteractive" nonce={nonce} />;
}
