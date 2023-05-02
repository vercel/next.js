import Link from 'next/link'
import '@/styles/b.css'
import { useEffect } from 'react'

export default function B() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then((harness) =>
      harness.markAsHydrated()
    )
  })

  return (
    <>
      <Link className="a" href="/a">
        A
      </Link>
    </>
  )
}
