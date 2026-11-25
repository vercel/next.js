import type { ReactNode } from 'react'

// `content` is a real children branch even though its route targets are all
// below named slots.
export default function Layout({
  children,
  sidebar,
}: {
  children: ReactNode
  sidebar: ReactNode
}) {
  return (
    <main>
      {children}
      {sidebar}
    </main>
  )
}
