'use client'
import { useEffect } from 'react'
import { INVALID_URL } from '../invalid-url'
import { Delay } from '../delay'
import { useRouter } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function Page() {
  const router = useRouter()
  useEffect(() => {
    router.prefetch(INVALID_URL)
  }, [router])

  return (
    <Delay>
      <h1>Hello, world!</h1>
    </Delay>
  )
}
