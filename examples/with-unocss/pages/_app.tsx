import type { AppProps } from "next/app";

import "uno.css";

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
