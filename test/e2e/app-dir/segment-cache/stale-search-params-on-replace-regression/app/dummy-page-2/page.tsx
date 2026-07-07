'use client'

import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <h1 id="dummy-page-2">Dummy Page 2</h1>
      <button id="go-home" onClick={() => router.replace('/')}>
        Go to home
      </button>
    </>
  )
}
