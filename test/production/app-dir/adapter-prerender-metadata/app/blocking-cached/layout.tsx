import { ReactNode } from 'react'
import { cacheLife } from 'next/cache'

// A cached component that completes during the fallback shell prerender (it
// doesn't read params), so its cacheLife propagates to the collected cache
// control of the fallback export.

async function CachedBanner() {
  'use cache'
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 })
  return <p>banner</p>
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <CachedBanner />
      {children}
    </>
  )
}
