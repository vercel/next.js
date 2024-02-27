import "./globals.css";

export const metadata = {
  title: "Next.js Sitemap Index Example",
  description: "Example of how to use sitemap index",
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
