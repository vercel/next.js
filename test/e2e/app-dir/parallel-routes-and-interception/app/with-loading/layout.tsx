import Link from 'next/link'
import { ReactNode } from 'react'

export default function Layout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <>
      <div>
        <Link href="/with-loading">Home</Link>
      </div>
      <div>
        <Link href="/with-loading/foo">To Loading Page</Link>
      </div>
      <div id="slot">{slot}</div>
      <div id="children">{children}</div>
    </>
  )
}
