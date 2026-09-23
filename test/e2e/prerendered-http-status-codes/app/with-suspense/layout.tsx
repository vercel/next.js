import { Suspense } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 id="layout">Shared layout</h1>
      <Suspense fallback={<p id="suspense-fallback">Loading...</p>}>
        {children}
      </Suspense>
    </>
  )
}
