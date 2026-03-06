import Link from 'next/link'
import { ReactNode } from 'react'
import { RouterAct } from '@next/router-act/component'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body style={{ fontFamily: 'monospace' }}>
        <RouterAct />
        <Header />
        {children}
      </body>
    </html>
  )
}

function Header() {
  return (
    <header>
      <Link href="/" prefetch={false}>
        Home
      </Link>
    </header>
  )
}
