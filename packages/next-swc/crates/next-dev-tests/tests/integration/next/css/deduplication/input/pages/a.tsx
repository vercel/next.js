import Link from 'next/link'
import '@/styles/a.css'
import { useEffect } from 'react'

export default function A() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then((harness) =>
      harness.markAsHydrated()
    )
  })

  return (
    <>
      <Link href="/b">B</Link>
    </>
  )
}
