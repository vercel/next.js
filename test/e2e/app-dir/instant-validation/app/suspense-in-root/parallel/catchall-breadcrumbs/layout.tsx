import type { ReactNode } from 'react'
import { Suspense } from 'react'

export default function Layout({
  children,
  breadcrumbs,
}: {
  children: ReactNode
  breadcrumbs: ReactNode
}) {
  return (
    <main>
      <div>{breadcrumbs}</div>
      <Suspense fallback="loading...">{children}</Suspense>
    </main>
  )
}
