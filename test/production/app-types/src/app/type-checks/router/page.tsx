'use client'

import { useRouter } from 'next/navigation'
import type { Route } from 'next'

export default function Page() {
  const router = useRouter()

  function test() {
    // Invalid routes:
    router.push('/wrong-link')
    router.push('/blog/a?1/b')
    router.push(`/blog/${'a/b/c'}`)

    // Correctly typed:
    router.push('/dashboard/another')
    router.prefetch('/about')
    router.push('/redirect')
    router.push(`/blog/${'a/b'}`)
    router.push('/invalid' as Route)
    router.back()
  }

  return <div onClick={test} />
}
