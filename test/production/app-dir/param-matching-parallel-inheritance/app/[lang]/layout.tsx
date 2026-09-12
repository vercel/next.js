import type { ReactNode } from 'react'

export const experimental_paramMatching = {
  lang: 'not-found',
} as const

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function Layout({
  children,
  main,
  sidebar,
}: {
  children: ReactNode
  main: ReactNode
  sidebar: ReactNode
}) {
  return (
    <>
      {children}
      {main}
      {sidebar}
    </>
  )
}
