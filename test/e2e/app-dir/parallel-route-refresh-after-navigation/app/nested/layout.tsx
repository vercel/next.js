import type { ReactNode } from 'react'

export default function Layout({
  children,
  details,
}: {
  children: ReactNode
  details: ReactNode
}) {
  return (
    <section>
      {children}
      {details}
    </section>
  )
}
