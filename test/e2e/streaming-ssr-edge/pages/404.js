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

export default function Page404() {
  return (
    <Suspense fallback={null}>
      <span id="text">custom-404-page</span>
      <Data />
    </Suspense>
  )
}
