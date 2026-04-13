import Link from 'next/link'
import { ReactNode } from 'react'
import { RouterAct } from '@next/router-act/component'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <RouterAct />
        <nav>
          <Link href="/" prefetch={false}>
            Home
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
