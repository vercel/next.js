import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlanetScale MySQL + Next.js",
  description: "A Next.js app using Prisma with PlanetScale MySQL",
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
