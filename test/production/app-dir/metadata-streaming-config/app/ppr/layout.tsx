import { Suspense } from 'react'

export default function Root({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
}
