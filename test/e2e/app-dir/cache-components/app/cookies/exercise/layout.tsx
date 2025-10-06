import { Suspense } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback="loading...">{children}</Suspense>
}
