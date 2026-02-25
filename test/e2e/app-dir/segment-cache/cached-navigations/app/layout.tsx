import Link from 'next/link'
import { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/">Home</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
