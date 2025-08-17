import { Metadata, Viewport } from "next";
import { CMS_NAME, HOME_OG_IMAGE_URL } from "@/lib/constants";
import "./index.css";

export const metadata: Metadata = {
  title: `Next.js Blog Example with ${CMS_NAME}`,
  icons: {
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
    icon: [
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon/favicon.ico" }],
    other: [
      {
        rel: "mask-icon",
        url: "/favicon/safari-pinned-tab.svg",
      },
    ],
  },
  manifest: "/favicon/site.webmanifest",
  applicationName: CMS_NAME,
  other: {
    "msapplication-TileColor": "#000000",
    "msapplication-config": "/favicon/browserconfig.xml",
  },
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  description: `A statically generated blog example using Next.js and ${CMS_NAME}.`,
  openGraph: {
    images: [HOME_OG_IMAGE_URL],
  },
};

export const viewport: Viewport = {
  themeColor: "#000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
