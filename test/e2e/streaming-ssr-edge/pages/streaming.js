import { Suspense } from 'react'

let result
let promise
function Data() {
  if (result) return result
  if (!promise)
    promise = new Promise((res) => {
      setTimeout(() => {
        result = 'next_streaming_data'
        res()
      }, 500)
    })
  throw promise
}

export default function Page() {
  return (
    <Suspense fallback="next_streaming_fallback">
      <Data />
    </Suspense>
  )
}

// Use config export
export const config = {
  runtime: 'experimental-edge',
}
