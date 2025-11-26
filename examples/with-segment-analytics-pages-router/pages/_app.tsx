import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import Header from "@/components/header";
import Analytics from "@/components/analytics";

const inter = Inter({ subsets: ["latin"] });

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <main className={inter.className}>
      <Header />
      <Component {...pageProps} />
      <Analytics />
    </main>
  );
}
