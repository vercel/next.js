import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ad Platforms Integration - Next.js Example",
  description: "Unified API client for AI content, Google Ads, Meta Ads, and Stripe",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
