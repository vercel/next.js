import type { AppProps } from "next/app";
import "../app.css";

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
