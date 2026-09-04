import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getLocale } from "gt-next/server";
import { getLocaleDirection } from "generaltranslation";
import { GTProvider } from "gt-next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GT + Next.js"
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLocale();
  return (
    <html lang={lang} dir={getLocaleDirection(lang)}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GTProvider>
          {children}
        </GTProvider>
      </body>
    </html>
  );
}
