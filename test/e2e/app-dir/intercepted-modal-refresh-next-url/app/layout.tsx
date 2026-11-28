import type { ReactNode } from 'react'
import Link from 'next/link'
import { DocumentStamp } from './document-stamp'

export default function Root({
  children,
  modal,
}: {
  children: ReactNode
  modal: ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/plain">Plain</Link>
          <Link href="/photo">Photo</Link>
          <Link href="/settings">Settings</Link>
        </nav>
        <DocumentStamp />
        {children}
        {modal}
      </body>
    </html>
  )
}
