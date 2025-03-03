import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Remove console",
  description: "Next.js example remove console",
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
