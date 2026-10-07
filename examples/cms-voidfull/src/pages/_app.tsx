import "@/globals.css";
import type { AppProps } from "next/app";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={inter.className}>
      <Header />
      <Component {...pageProps} />
      <Footer />
    </div>
  );
}
