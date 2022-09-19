import { Suspense } from 'react'
import Nav from '../../components/nav'

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
    <div>
      <div id="content">
        <Suspense fallback="next_streaming_fallback">
          <Data />
        </Suspense>
      </div>
      <div>
        <Nav />
      </div>
    </div>
  )
}
