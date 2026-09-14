import dynamic from 'next/dynamic'
import { Suspense, useState } from 'react'

const hydration =
  typeof window === 'undefined'
    ? null
    : (window.dynamicHydration = {
        originalRoom: document.getElementById('hydration-room'),
        loaded: false,
        suspended: false,
        released: false,
      })

const gate = new Promise((resolve) => {
  if (hydration) {
    hydration.release = () => {
      hydration.released = true
      resolve()
    }
  }
})

function Loading({ isLoading, pastDelay, timedOut, error }) {
  return (
    <p id="dynamic-loading">
      {JSON.stringify({ isLoading, pastDelay, timedOut, error })}
    </p>
  )
}

const ClientHeader = dynamic(
  () =>
    import('../components/hydration-header').then((mod) => {
      if (hydration) hydration.loaded = true
      return mod
    }),
  { ssr: false, loading: Loading }
)

const ServerHeader = dynamic(
  () =>
    import('../components/hydration-header').then((mod) => {
      if (hydration) hydration.loaded = true
      return mod
    }),
  { ssr: true, loading: Loading }
)

function Gate() {
  if (hydration && !hydration.released) {
    hydration.suspended = true
    throw gate
  }
  return null
}

export default function Hydration({ mode }) {
  const [count, setCount] = useState(0)
  const Header = mode === 'ssr-retry' ? ServerHeader : ClientHeader
  const content = (
    <div>
      <Header />
      {mode !== 'plain' && <Gate />}
      <button id="hydration-room" onClick={() => setCount(count + 1)}>
        Room: {count}
      </button>
    </div>
  )

  return mode === 'retry-no-boundary' ? (
    content
  ) : (
    <Suspense fallback={<p>Waiting</p>}>{content}</Suspense>
  )
}

export function getServerSideProps({ query }) {
  return { props: { mode: query.mode || 'retry' } }
}
