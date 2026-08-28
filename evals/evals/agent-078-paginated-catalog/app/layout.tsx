import Link from 'next/link'
import type { ReactNode } from 'react'

export const metadata = {
  title: 'Harbor & Field Supply',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <h1>Harbor &amp; Field Supply</h1>
          <nav>
            <Link href="/">Home</Link>{' '}
            <Link href="/catalog?page=1">Catalog</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  )
}
