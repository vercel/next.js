import Link from 'next/link'
import { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Link href="/partial-fallback-params" prefetch={false}>
        Hub
      </Link>
      <Link href="/partial-fallback-params/bar" prefetch={false}>
        bar
      </Link>
      {children}
    </>
  )
}
