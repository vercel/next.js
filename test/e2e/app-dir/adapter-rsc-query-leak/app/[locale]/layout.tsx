import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'de' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
