'use client'

import { useState } from 'react'
import { redirectAction } from '../actions'

export default function Page() {
  const [result, setResult] = useState('pending')

  return (
    <div>
      <p id="action-result">{result}</p>
      <button
        id="redirect-external-check"
        onClick={async () => {
          try {
            const value = await redirectAction(
              'https://next-data-api-endpoint.vercel.app/api/random?page'
            )
            // If we get here, the action resolved instead of throwing.
            // This is the bug — external redirects should throw, not resolve.
            setResult('resolved:' + String(value))
          } catch (e) {
            // This is the expected behavior — redirect should throw.
            setResult('thrown')
          }
        }}
      >
        redirect external and check return
      </button>
    </div>
  )
}
