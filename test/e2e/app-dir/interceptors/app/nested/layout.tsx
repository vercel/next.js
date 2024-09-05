import { ReactNode } from 'react'
import { createTimeStamp, logWithTime } from '../time-utils'
import { setTimeout } from 'timers/promises'

export default async function NestedLayout({
  children,
}: {
  children: ReactNode
}) {
  await logWithTime('NestedLayout', () => setTimeout(500))

  return (
    <main>
      <h2>Nested Layout {createTimeStamp()}</h2>
      {children}
    </main>
  )
}
