import type { ReactNode } from 'react'
import { Suspense } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return <Suspense fallback="loading...">{children}</Suspense>
}
