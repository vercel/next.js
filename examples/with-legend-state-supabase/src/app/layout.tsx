import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <body className={`antialiased bg-mobai-background`}>{children}</body>
    </html>
  );
}
