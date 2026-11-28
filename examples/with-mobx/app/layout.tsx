"use client"; // Ensure this file runs on the client side

import { StoreProvider } from "../components/StoreProvider";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
