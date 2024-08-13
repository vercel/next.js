import { GoogleTagManager } from "@next/third-parties/google";

export const metadata = {
  title: "Google Analytics Next.js",
  description:
    "This example shows how to use Next.js along with Google Analytics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GA_ID as string} />
      <body>{children}</body>
    </html>
  );
}
