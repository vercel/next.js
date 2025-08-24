import "../styles/globals.css";
import type { AppProps } from "next/app";

import { ConvexProvider, ConvexReactClient } from "convex/react";

const address = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!address) {
  throw new Error("Convex deployment url not found in environment.");
}
const convex = new ConvexReactClient(address);

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ConvexProvider client={convex}>
      <Component {...pageProps} />
    </ConvexProvider>
  );
}

export default MyApp;
