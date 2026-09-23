import type { ReactNode } from 'react'

export const experimental_paramMatching = { locale: 'not-found' } as const

export function generateStaticParams() {
  return [{ locale: 'en' }]
}

export default function Layout({
  children,
  other,
}: {
  children: ReactNode
  other: ReactNode
}) {
  return (
    <>
      {children}
      {other}
    </>
  )
}
