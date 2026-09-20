import { Suspense, type ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div id="top-fallback">loading top...</div>}>
      {children}
    </Suspense>
  )
}
