import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Route Handlers",
  description: "Route Handlers in the Next.js App Router",
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
