import { Inter } from "next/font/google";
import Header from "@/components/header";
import Analytics from "@/components/analytics";
import { Suspense } from "react";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body className={inter.className}>
        <Header />
        {children}
        <Suspense>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
