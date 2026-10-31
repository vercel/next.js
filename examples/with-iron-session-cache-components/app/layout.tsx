import type { ReactNode } from "react";

export const metadata = {
  title: "iron-session + Cache Components",
  description: "Authentication with Next.js Cache Components and iron-session.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
