import { Suspense } from 'react'

export default function Root({ children }) {
  return <Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
}
