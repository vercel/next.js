'use client'

import { useState } from 'react'
import { log } from './action'

if (typeof window !== 'undefined') {
  // hijack fetch
  const originalFetch = window.fetch
  window.fetch = function (url, init) {
    if (window.__override_forwarded_host && init?.method === 'POST') {
      console.log('fetch', url, init)

      // override forwarded host
      init.headers = init.headers || {}
      init.headers['x-forwarded-host'] = window.__override_forwarded_host
    }

    return originalFetch(url, init)
  }
}

export default function Page() {
  const [res, setRes] = useState(null)

  return (
    <div>
      <div id="res">{res}</div>
      <button
        onClick={async () => {
          try {
            setRes(await log())
          } catch (err) {
            setRes(err.message)
          }
        }}
      >
        fetch
      </button>
    </div>
  )
}
