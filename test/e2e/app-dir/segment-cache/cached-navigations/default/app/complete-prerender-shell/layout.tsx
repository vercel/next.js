import Link from 'next/link'
import { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Link href="/complete-prerender-shell" prefetch={false}>
        Hub
      </Link>
      <Link href="/complete-prerender-shell/bar" prefetch={false}>
        bar
      </Link>
      {children}
    </>
  )
}
