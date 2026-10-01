import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ item: 'known' }]
}

export default function Layout({
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
