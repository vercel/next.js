import { Inter } from 'next/font/google'
import type { Metadata } from "next";

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Next.js with OpenTelemetry',
  description: 'Next.js with OpenTelemetry',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
