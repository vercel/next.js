import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Next.js OpenAPI Generator Example",
  description: "Example showing how to use next-openapi-gen with Next.js and Zod",
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
