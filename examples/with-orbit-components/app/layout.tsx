"use client"
import { getTokens } from "@kiwicom/orbit-components";
import "./globals.css"; // Import TailwindCSS globals

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>My Orbit + Tailwind App</title>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body>
          {children}
      </body>
    </html>
  );
}
