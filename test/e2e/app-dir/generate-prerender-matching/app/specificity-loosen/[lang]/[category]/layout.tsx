import type { ReactNode } from 'react'

export const experimental_paramMatching = {
  category: 'not-found',
} as const

export function generateStaticParams() {
  return [{ lang: 'en', category: 'shoes' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
