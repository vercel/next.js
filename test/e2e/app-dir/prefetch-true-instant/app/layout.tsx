import Link from 'next/link'
import { ReactNode } from 'react'
import { RouterAct } from '@next/router-act/component'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <RouterAct />
        <header>
          <Link href="/" prefetch={false}>
            Home
          </Link>
        </header>
        {children}
      </body>
    </html>
  )
}
