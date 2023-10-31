import { Suspense } from 'react'
import Counter from '../../components/partial-hydration-counter'
import { createDataFetcher } from '../../lib/data'

const Data = createDataFetcher('next_streaming_data', {
  timeout: 1000,
})

export default function () {
  return (
    <>
      {process.env.NEXT_RUNTIME === 'edge'
        ? `Runtime: Node.js`
        : 'Runtime: Edge/Browser'}
      <br />
      <div className="suspense">
        <Suspense fallback="next_streaming_fallback">
          <Data />
        </Suspense>
      </div>
      <br />
      <Counter />
    </>
  )
}

export const dynamic = 'force-dynamic'
