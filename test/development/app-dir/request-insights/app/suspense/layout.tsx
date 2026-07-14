import { Suspense, type ReactNode } from 'react'

export default function SuspenseLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p>loading</p>}>{children}</Suspense>
}
