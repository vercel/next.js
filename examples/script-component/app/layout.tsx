import type { Metadata } from "next";
import "../styles/global.css";
import PageFooter from "../components/PageFooter";

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
          <PageFooter />
        </footer>
      </body>
    </html>
  );
}
