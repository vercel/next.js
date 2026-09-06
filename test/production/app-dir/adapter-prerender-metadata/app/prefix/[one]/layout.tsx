import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ one: 'b' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
