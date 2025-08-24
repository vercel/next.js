import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "With YouTube Embed",
  description: "Next.js example with YouTube Embed.",
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
