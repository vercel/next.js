import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'View Transitions Demo',
  description: 'A simple app with page navigation',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Home</Link>
          <Link href="/about">About</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
