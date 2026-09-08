import { ReactNode } from 'react'
import { cacheLife } from 'next/cache'

async function CachedBanner() {
  'use cache'
  cacheLife({ stale: 400, revalidate: 3600, expire: 86400 })
  return <p>{new Date().toISOString()}</p>
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <main>
      <CachedBanner />
      {children}
    </main>
  )
}
