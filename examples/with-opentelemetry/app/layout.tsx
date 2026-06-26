import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Next.js with OpenTelemetry",
  description: "Next.js with OpenTelemetry",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
