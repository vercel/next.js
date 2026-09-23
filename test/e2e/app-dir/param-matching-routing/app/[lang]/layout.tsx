import type { ReactNode } from 'react'

export const experimental_paramMatching = { lang: 'not-found' } as const

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'es' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return <section id="language-layout">{children}</section>
}
