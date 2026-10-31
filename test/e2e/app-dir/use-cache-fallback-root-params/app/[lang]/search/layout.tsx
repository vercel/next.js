import { Suspense } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p>Loading search results</p>}>{children}</Suspense>
  )
}
