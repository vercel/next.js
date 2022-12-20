'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default () => {
  const router = useRouter()
  return (
    <>
      <button id="push-long-load" onClick={() => router.push('/long-load')}>
        push long load
      </button>
      <button
        id="replace-long-load"
        onClick={() => router.replace('/long-load')}
      >
        push long load
      </button>
      <Link id="link-long-load" href="/long-load">
        Link to long load
      </Link>
    </>
  )
}
