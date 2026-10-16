import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'

export const metadata: Metadata = {
  title: 'Shared layout',
}

// A dynamic layout that stays mounted while navigating between its children.
export default async function SharedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await connection()
  return (
    <>
      <nav>
        <Link href="/shared/destination">Destination</Link>
        <Link href="/shared/destination/detail">Detail</Link>
      </nav>
      <div id="slot">{children}</div>
    </>
  )
}
