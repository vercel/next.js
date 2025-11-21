import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import Image from "next/image";

import { MUX_HOME_PAGE_URL } from "./constants";
import MuxLogo from "./mux.svg";

import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--sans" });
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--mono",
});

const title = "Mux + Next.js";
const description = "Upload and view a video with Mux and Next.js";
export const metadata: Metadata = {
  metadataBase: process.env.VERCEL_URL
    ? new URL(`https://${process.env.VERCEL_URL}`)
    : new URL(`http://localhost:${process.env.PORT || 3000}`),
  title,
  description,
  openGraph: {
    title,
    description,
  },
  twitter: {
    title,
    description,
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`min-h-screen flex flex-col font-sans ${dmSans.variable} ${jetBrainsMono.variable}`}
      >
        <main className="px-4 py-8 sm:px-8 lg:py-16 w-full max-w-2xl mx-auto">
          {children}
        </main>
        <footer className="mt-auto w-full h-24 border-t border-gray-500 flex items-center justify-center">
          Powered by
          <a href={MUX_HOME_PAGE_URL} target="_blank" rel="noopener noreferrer">
            <Image src={MuxLogo} alt="Mux" className="ml-2 w-16" />
          </a>
        </footer>
      </body>
    </html>
  );
}
