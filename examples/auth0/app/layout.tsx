import { UserProvider } from "@auth0/nextjs-auth0/client";
import { Header } from "@/components/header";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next.js with Auth0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <UserProvider>
          <Header />
          <main>
            <div className="container">{children}</div>
          </main>
        </UserProvider>
      </body>
    </html>
  );
}
