import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "With Google Maps Embed",
  description: "Next.js example with Google Maps Embed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
