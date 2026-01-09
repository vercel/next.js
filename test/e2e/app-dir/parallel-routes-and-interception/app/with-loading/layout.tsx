import Link from 'next/link'
import { ReactNode, Suspense } from 'react'

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
      <div id="slot">
        <Suspense fallback="loading slot...">{slot}</Suspense>
      </div>
      <div id="children">{children}</div>
    </>
  )
}
