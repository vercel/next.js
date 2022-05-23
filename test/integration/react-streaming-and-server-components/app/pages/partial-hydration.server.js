import { Suspense } from 'react'

import Counter from '../components/partial-hydration-counter.client'

let result
let promise
function Data() {
  if (result) {
    try {
      return result
    } finally {
      promise = null
      result = null
    }
  }
  if (!promise)
    promise = new Promise((res) => {
      setTimeout(() => {
        result = 'next_streaming_data'
        res()
      }, 1000)
    })
  throw promise
}

export default function () {
  return (
    <>
      {process.version
        ? `Runtime: Node.js ${process.version}`
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

export const config = {
  runtime: 'edge',
}
