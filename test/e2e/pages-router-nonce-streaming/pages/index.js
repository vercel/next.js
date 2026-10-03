import { Suspense } from 'react'

// Keyed per request so every request suspends, not just the first one to reach
// the server. React retries a suspended component, so the same promise has to
// come back on the retry or it would suspend forever.
const pending = new Map()
const resolved = new Set()

function suspendOnce(key, durationMs) {
  if (resolved.has(key)) return

  let promise = pending.get(key)
  if (!promise) {
    promise = new Promise((resolve) => {
      setTimeout(() => {
        resolved.add(key)
        resolve()
      }, durationMs)
    })
    pending.set(key, promise)
  }

  throw promise
}

// Bulk markup between the boundaries so the shell is large enough to be flushed
// before the later boundaries resolve — otherwise React inlines the resolved
// content and never emits the reveal instructions this test is about.
function Filler() {
  return (
    <div>
      {Array.from({ length: 200 }, (_, i) => (
        <p key={i}>Static content line {i}</p>
      ))}
    </div>
  )
}

function Boundary({ requestId, name, children }) {
  suspendOnce(`${requestId}-${name}`, 700)
  return <>{children}</>
}

// Nested boundaries: each only starts rendering — and therefore only starts
// suspending — once its parent has resolved, so they resolve in sequence well
// after the shell has gone out.
export default function Page({ requestId }) {
  return (
    <Suspense fallback={<p id="outer-fallback">loading outer</p>}>
      <Boundary requestId={requestId} name="outer">
        <Filler />
        <Suspense fallback={<p id="middle-fallback">loading middle</p>}>
          <Boundary requestId={requestId} name="middle">
            <Filler />
            <Suspense fallback={<p id="inner-fallback">loading inner</p>}>
              <Boundary requestId={requestId} name="inner">
                <p id="slow">resolved</p>
              </Boundary>
            </Suspense>
          </Boundary>
        </Suspense>
      </Boundary>
    </Suspense>
  )
}

export function getServerSideProps() {
  return { props: { requestId: `${Date.now()}-${Math.random()}` } }
}
