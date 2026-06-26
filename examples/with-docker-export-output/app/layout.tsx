import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Next.js Docker Example - Standalone & Static Export",
  description:
    "A production-ready example demonstrating how to Dockerize Next.js applications using standalone mode and static export.",
  keywords: [
    "Next.js",
    "Docker",
    "standalone mode",
    "static export",
    "containerization",
    "React",
    "Node.js",
    "Nginx",
  ],
  openGraph: {
    title: "Next.js Docker Example - Standalone & Static Export",
    description:
      "A production-ready example demonstrating how to Dockerize Next.js applications using standalone mode and static export.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Next.js Docker Example - Standalone & Static Export",
    description:
      "A production-ready example demonstrating how to Dockerize Next.js applications using standalone mode and static export.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
