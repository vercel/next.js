import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

export default function Page() {
  return (
    <main>
      <h1>Home</h1>
      <Link href="/guide" prefetch={false}>
        Open guide
      </Link>
    </main>
  )
}
