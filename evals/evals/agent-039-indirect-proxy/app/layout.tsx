import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Next.js 16 App',
  description: 'Testing request logging',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
