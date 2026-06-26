'use client'

import { useRouter } from 'next/navigation'

export function PushButton() {
  const router = useRouter()
  return (
    <>
      <button id="push-some-page" onClick={() => router.push('/some-page')}>
        Push some page
      </button>
      <button id="push-hash" onClick={() => router.push('/#section')}>
        Push hash
      </button>
    </>
  )
}
