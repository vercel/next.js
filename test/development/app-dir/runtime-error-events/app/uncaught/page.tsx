'use client'
import { createRoot } from 'react-dom/client'
import { onUncaughtError } from 'next/dist/client/react-client-callbacks/error-boundary-callbacks'
function Thrower() {
  throw new Error('uncaught root failed')
}
export default function Page() {
  return (
    <>
      <p id="content">Main app still mounted</p>
      <button
        id="throw"
        onClick={() => {
          const container = document.createElement('div')
          document.body.appendChild(container)
          // Exercise Next's root callback without an intervening error boundary.
          createRoot(container, { onUncaughtError }).render(<Thrower />)
        }}
      >
        Throw in another root
      </button>
    </>
  )
}
