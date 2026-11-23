import { Suspense } from 'react'
import { CrashButton } from './crash-button'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CrashButton />
      <Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
    </>
  )
}
