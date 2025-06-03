import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "With Rspack",
  description: "Next.js example with rspack.",
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
