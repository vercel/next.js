import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "With Linaria",
  description: "Next.js example with Linaria.",
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
