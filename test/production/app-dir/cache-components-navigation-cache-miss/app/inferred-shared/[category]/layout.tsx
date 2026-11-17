import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ category: 'first' }, { category: 'second' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
