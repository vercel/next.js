'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()

  return (
    <main>
      <Link id="go-back-with-link" href="/component-redirect">
        Go Back with Link.
      </Link>
      <button
        id="go-back-with-router"
        type="button"
        onClick={(e) => {
          e.preventDefault()
          router.push('/component-redirect')
        }}
      >
        Go back with Router
      </button>
    </main>
  )
}
