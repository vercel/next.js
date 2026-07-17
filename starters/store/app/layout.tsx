import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { getCartCount } from "@/features/cart/cart-queries";
import {
  CartBadge,
  CartBadgeSkeleton,
} from "@/features/cart/components/cart-badge";
import { CartProvider } from "@/features/cart/components/cart-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: "%s | Store",
    default: "Store",
  },
  description: "A store starter built on Cache Components.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const countPromise = getCartCount();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 font-sans">
        <CartProvider countPromise={countPromise}>
          <header className="flex items-center justify-between py-8">
            <Link href="/" className="font-semibold">
              Store
            </Link>
            <nav>
              <Link
                href="/cart"
                className="text-sm text-foreground/70 hover:text-foreground"
              >
                Cart (
                <Suspense fallback={<CartBadgeSkeleton />}>
                  <CartBadge />
                </Suspense>
                )
              </Link>
            </nav>
          </header>
          <main className="flex-1 pb-16">{children}</main>
        </CartProvider>
      </body>
    </html>
  );
}
