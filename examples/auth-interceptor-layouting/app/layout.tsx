import Link from "next/link";
import { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <h1>Root Layout</h1>
        <nav>
          <ul>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href="/dashboard">Dashboard Logged-In</Link>
            </li>
            <li>
              <Link href="/dashboard?logged-out">Dashboard Logged-Out</Link>
            </li>
            <li>
              <Link href="/sign-in">Sign-In</Link>
            </li>
          </ul>
        </nav>
        {children}
      </body>
    </html>
  );
}
