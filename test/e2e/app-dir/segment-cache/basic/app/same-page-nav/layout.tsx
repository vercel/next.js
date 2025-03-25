import { Suspense } from 'react'
import { connection } from 'next/server'

async function Content({ children }: { children: React.ReactNode }) {
  // Treat the layout as dynamic so we can detect when it's refreshed
  await connection()
  return <div id="same-page-nav-layout">{children}</div>
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback="Loading...">
      <Content>{children}</Content>
    </Suspense>
  )
}
