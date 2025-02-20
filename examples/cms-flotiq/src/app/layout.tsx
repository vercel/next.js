import type { Metadata } from "next";
import "./globals.css";

import Footer from "./_components/Footer/Footer";
import Navigation from "./_components/Navigation/Navigation";

export const metadata: Metadata = {
  title: {
    template: "%s | Flotiq Next.js starter for blog",
    default: "Flotiq Next.js starter for blog",
  },
  description: "Flotiq NextJs starter for blog",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen max-w-7xl mx-auto px-5 md:px-10 2xl:px-0">
        <Navigation />
        <main className="mb-10">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
