import Link from 'next/link'
import { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body style={{ fontFamily: 'monospace' }}>
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
