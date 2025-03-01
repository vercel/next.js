import type { Metadata } from "next";
import Link from "next/link";
import "../styles/global.css";
import PageFooter from "../components/PageFooter"; // Import the client component

export const metadata: Metadata = {
  title: "My App",
  description: "Converted from Pages Router to App Router",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer>
          <PageFooter /> {/* This is now a client component */}
        </footer>
      </body>
    </html>
  );
}
