import Link from 'next/link'
import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Signal Shop</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
