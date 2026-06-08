import { ReactNode } from 'react'
import Link from 'next/link'

export default function Root({
  children,
  modal,
}: {
  children: ReactNode
  modal: ReactNode
}) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/login" id="to-login" prefetch={false}>
            Login
          </Link>
          <Link href="/" id="to-home" prefetch={false}>
            Home
          </Link>
        </nav>
        {children}
        {modal}
      </body>
    </html>
  )
}
