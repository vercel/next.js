import { Inter } from "next/font/google";
import Header from "@/components/header";
import Analytics from "@/components/analytics";

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
      </body>
      <Analytics />
    </html>
  );
}
