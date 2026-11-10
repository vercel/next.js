import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ 'my-slug': 'b' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
