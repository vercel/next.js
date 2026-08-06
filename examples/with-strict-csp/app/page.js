import { headers } from "next/headers";
import Script from "next/script";

export default async function Page() {
  const headerStore = await headers();
  const nonce = headerStore.get("x-nonce");

  return <Script src="https://..." strategy="afterInteractive" nonce={nonce} />;
}
