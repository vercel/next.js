import type { ReactNode } from 'react'

export const experimental_paramMatching = {
  lang: 'blocking',
  missing: 'fallback',
}

export default function Layout({ children }: { children: ReactNode }) {
  return <section>{children}</section>
}
