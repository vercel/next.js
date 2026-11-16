import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ section: 'intro' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return <section>{children}</section>
}
