// TODO-APP: enable when flight error serialization is implemented
import { notFound } from 'next/navigation'

import { Suspense } from 'react'

let result
let promise
function Data() {
  if (result) return result
  if (!promise)
    promise = new Promise((res) => {
      setTimeout(() => {
        result = <N />
        res()
      }, 500)
    })
  throw promise
}

function N() {
  notFound()
  return null
}

export default function Page() {
  return (
    <Suspense fallback="next_streaming_fallback">
      <Data />
    </Suspense>
  )
}
