import type { ReactNode } from 'react'
import { connection } from 'next/server'

// The layout blocks on request-time data, so the hole in the static shell of
// the route is above the Suspense boundary of the page.
export default async function Layout({ children }: { children: ReactNode }) {
  await connection()
  return <section>{children}</section>
}
