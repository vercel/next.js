import { connection } from 'next/server'
import { ReactNode } from 'react'

// This layout awaits connection() without its own Suspense boundary.
// When (outer)/layout is shared (e.g. navigating from /foo to /),
// there is no Suspense above this layout in the new tree, so
// the navigation will be blocking.
export default async function InnerLayout({
  children,
}: {
  children: ReactNode
}) {
  await connection()
  return (
    <div>
      <em>Inner route group layout (awaits connection, no Suspense)</em>
      {children}
    </div>
  )
}
