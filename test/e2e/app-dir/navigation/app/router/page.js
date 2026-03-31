'use client'

import Script from 'next/script'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  return (
    <div>
      <button
        id="dynamic-link"
        onClick={() => router.push('/router/dynamic-gsp/1/')}
      >
        Test routing
      </button>
      {/* adding a script here to make sure app internals might execute earlier */}
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="beforeInteractive"
      />
    </div>
  )
}
