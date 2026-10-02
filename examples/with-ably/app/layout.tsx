import "../styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Realtime messaging with Next.js and Ably",
  description:
    "Next.js App Router example using Ably for pub/sub messaging and presence.",
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
