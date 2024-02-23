// Package imports
import { draftMode } from "next/headers";
import { Inter } from "next/font/google";

// Layout imports
import "@/app/globals.css";

// Component imports
import Navigation from "@/components/Globals/Navigation/Navigation";
import { PreviewNotice } from "@/components/Globals/PreviewNotice/PreviewNotice";

// Setup Inter font
const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isEnabled } = draftMode();

  return (
    <html lang="en">
      <body className={inter.className}>
        {isEnabled && <PreviewNotice />}
        <Navigation />
        {children}
      </body>
    </html>
  );
}
