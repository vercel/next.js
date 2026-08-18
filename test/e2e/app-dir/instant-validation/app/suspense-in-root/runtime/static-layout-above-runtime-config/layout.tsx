import { cookies } from 'next/headers'
import { ReactNode } from 'react'

// This layout calls cookies() without Suspense and has no instant
// config. It sits above a deeper layout with runtime prefetch config.
// From the developer's perspective, they configured runtime prefetching
// deeper in the tree, so cookies() should be fine. But this layout
// gets static prefetching by default (since the config is below it),
// making the cookies() call a blocking violation.
export default async function StaticLayout({
  children,
}: {
  children: ReactNode
}) {
  await cookies()
  return (
    <div>
      <em>Static layout above runtime config (calls cookies)</em>
      {children}
    </div>
  )
}
