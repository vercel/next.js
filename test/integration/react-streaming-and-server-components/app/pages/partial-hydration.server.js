import { Suspense } from 'react'

import Counter from '../components/partial-hydration-counter.client'

let result
let promise
function Data() {
  if (result) return result
  if (!promise)
    promise = new Promise((res) => {
      setTimeout(() => {
        result = 'next_streaming_data'
        res()
      }, 1000)
    })
  throw promise
}

export default function Page() {
  return (
    <>
      Current Runtime:{' '}
      {typeof window === 'undefined'
        ? typeof ReadableStream === 'undefined'
          ? 'nodejs-server'
          : 'edge-server'
        : 'browser'}
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
