import { headers } from "next/headers";
import Script from "next/script";

export default function Page() {
  const nonce = (await headers()).get("x-nonce");

  return <Script src="https://..." strategy="afterInteractive" nonce={nonce} />;
}
