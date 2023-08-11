import Logo from "@/components/shared/logo";
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./provider";

const font = Poppins({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "With Iamjs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <Providers>
        <div className="flex absolute top-0 left-0 p-8 xl:p-24">
          <Link target="_blank" href="https://iamjs.achaq.dev">
            <Logo />
          </Link>
        </div>
        <body className={font.className}>{children}</body>
      </Providers>
    </html>
  );
}
