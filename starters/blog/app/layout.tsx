import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
    template: "%s | Blog",
    default: "Blog",
  },
  description: "A blog starter built on Cache Components.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 font-sans">
        <header className="flex items-center justify-between py-8">
          <Link href="/" className="font-semibold">
            Blog
          </Link>
          <nav>
            <Link
              href="/"
              className="text-sm text-foreground/70 hover:text-foreground"
            >
              Posts
            </Link>
          </nav>
        </header>
        <main className="flex-1 pb-16">{children}</main>
        <footer className="border-t border-foreground/10 py-8 text-sm text-foreground/50">
          Built with Next.js Cache Components
        </footer>
      </body>
    </html>
  );
}
