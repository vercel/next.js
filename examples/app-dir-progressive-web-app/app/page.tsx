import { Metadata } from "next";

/** Add your relevant code here for the issue to reproduce */
export default function Home() {
  return <h1>PWA 💖 Next.js</h1>;
}

const APP_NAME = "next-pwa example";
const APP_DESCRIPTION = "This is an example of using next-pwa plugin";

export const metadata: Metadata = {
  title: "PWA 💖 Next.js",
  description: APP_DESCRIPTION,
  twitter: {
    card: "summary_large_image",
    creator: "@imamdev_",
    images: "https://example.com/og.png",
  },
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  themeColor: "#317EFB",
  viewport:
    "width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no",
  manifest: "/manifest.json",
  icons: [
    { rel: "icon", url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    { rel: "icon", url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    { rel: "apple-touch-icon", url: "/apple-icon.png" },
  ],
  keywords: ["nextjs", "pwa", "next-pwa"],
};
