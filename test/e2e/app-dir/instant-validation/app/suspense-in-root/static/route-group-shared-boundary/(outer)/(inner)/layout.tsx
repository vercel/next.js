import { cookies } from 'next/headers'
import { ReactNode } from 'react'

// This layout awaits cookies() without its own Suspense boundary.
// When (outer)/layout is shared (e.g. navigating from /foo to /),
// there is no Suspense above this layout in the new tree, so
// the navigation will be blocking.
export default async function InnerLayout({
  children,
}: {
  children: ReactNode
}) {
  await cookies()
  return (
    <div>
      <em>Inner route group layout (awaits cookies, no Suspense)</em>
      {children}
    </div>
  )
}
