import type { Metadata } from "next";

// Add your polyfills here or at the component level.
// For example...
// import 'resize-observer-polyfill'

export const metadata: Metadata = {
  title: "With Polyfills",
  description: "Next.js example with polyfills.",
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
