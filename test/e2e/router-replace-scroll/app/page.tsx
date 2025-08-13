'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  return (
    <div>
      <h1 id="home-title">Home Page</h1>

      <div style={{ marginBottom: '2000px' }}>
        <p>Scroll down to the bottom for the action button</p>
      </div>

      <div style={{ marginTop: '2000px' }}>
        <p id="bottom-marker">Bottom of page</p>
        <button
          id="replace-foo-bar-scroll-true"
          onClick={() => {
            router.replace('/?foo=bar', { scroll: true })
          }}
        >
          Replace ?foo=bar with scroll: true
        </button>
      </div>
    </div>
  )
}
