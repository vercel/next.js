'use client'

import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  return (
    <div>
      <h1>Home</h1>
      <button
        id="push-and-replace"
        onClick={() => {
          // The destination page suspends forever, so the push settles but
          // never commits. The replace then supersedes the pending push.
          router.push('/push-and-replace/suspended')
          setTimeout(() => {
            router.replace('/push-and-replace/other')
          }, 500)
        }}
      >
        Push and replace
      </button>
    </div>
  )
}
