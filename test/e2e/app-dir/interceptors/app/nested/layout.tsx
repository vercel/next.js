import { ReactNode } from 'react'
import { createTimeStamp, logWithTime } from '../time-utils'
import { setTimeout } from 'timers/promises'
import Link from 'next/link'

export default async function NestedLayout({
  children,
}: {
  children: ReactNode
}) {
  await logWithTime('NestedLayout', () => setTimeout(200))

  return (
    <main>
      <h2>Nested Layout {createTimeStamp()}</h2>
      <Link href="/nested/foo">foo</Link> <Link href="/nested/bar">bar</Link>
      {children}
    </main>
  )
}
