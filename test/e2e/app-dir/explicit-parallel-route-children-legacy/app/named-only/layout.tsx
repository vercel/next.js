import type { ReactNode } from 'react'

export default function NamedOnlyLayout({
  children,
  left,
  right,
}: {
  children: ReactNode
  left: ReactNode
  right: ReactNode
}) {
  return (
    <main>
      {children}
      {left}
      {right}
    </main>
  )
}
