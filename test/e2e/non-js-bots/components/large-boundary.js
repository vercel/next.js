import { Suspense } from 'react'

// ~21KB so the completed boundary exceeds the default progressiveChunkSize
// (12800) and gets outlined for JS-capable clients.
const bigText = 'lorem ipsum dolor sit amet '.repeat(800)

export function LargeBoundary({ id }) {
  return (
    <Suspense fallback={<p>{`loading-${id}`}</p>}>
      <div>
        <p data-testid={`marker-${id}-start`}>{`marker-${id}-start`}</p>
        <p>{bigText}</p>
        <p data-testid={`marker-${id}-end`}>{`marker-${id}-end`}</p>
      </div>
    </Suspense>
  )
}
