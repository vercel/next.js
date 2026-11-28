import type { Metadata } from "next";
import { Header } from "@/_components/Header";
import { XPixel } from "@/_components/XPixel";

export const metadata: Metadata = {
  title: "With X Pixel",
  description: "Next.js example with the X Pixel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <XPixel pixelId={process.env.NEXT_PUBLIC_X_PIXEL_ID as string} />
      </body>
    </html>
  );
}
