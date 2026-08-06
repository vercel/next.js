import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "With urql",
  description: "Next.js example with urql",
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
