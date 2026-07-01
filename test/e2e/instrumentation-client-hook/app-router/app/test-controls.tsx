'use client'

import { useRouter } from 'next/navigation'

export function TestControls() {
  const router = useRouter()
  return (
    <>
      <button id="push-no-prefetch" onClick={() => router.push('/no-prefetch')}>
        Push no-prefetch
      </button>
      <button
        id="abort-double-push"
        onClick={() => {
          // Two navigations in one tick: the second supersedes the first, so the
          // first should be reported as aborted when the second commits.
          router.push('/some-page')
          router.push('/dashboard')
        }}
      >
        Abort double push
      </button>
      <button id="push-hash" onClick={() => router.push('/#section')}>
        Push hash
      </button>
    </>
  )
}
