import Link from 'next/link'
import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then((mod) => mod.markAsHydrated())
  })

  return (
    <Link href="/not-found" data-test-link>
      Not found
    </Link>
  )
}
