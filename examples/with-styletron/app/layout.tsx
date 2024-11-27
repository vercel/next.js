"use client";
import { Provider as StyletronProvider } from "styletron-react";
import { styletron } from "../styletron";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <StyletronProvider value={styletron}>
    <html lang="en">
      <head />
      <body>{children}</body>
    </html>
    </StyletronProvider>
  );
}
