import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Image Alt Text Test",
  description: "Testing automatic alt text generation for images",
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
