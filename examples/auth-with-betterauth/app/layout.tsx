import "./globals.css";

export const metadata = {
  title: "Next.js Authentication with Better Auth",
  description: "Example using Better Auth",
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
