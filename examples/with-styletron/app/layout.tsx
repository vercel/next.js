"use client";

import { Provider as StyletronProvider } from "styletron-react";
import { styletron } from "../styletron";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <StyletronProvider value={styletron}>
        <body>{children}</body>
      </StyletronProvider>
    </html>
  );
}
