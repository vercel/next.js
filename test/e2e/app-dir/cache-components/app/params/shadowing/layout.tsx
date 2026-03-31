import { Suspense } from 'react'

export default function Layout({ children }) {
  return <Suspense fallback="loading">{children}</Suspense>
}
