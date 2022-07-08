import { Suspense } from 'react'

let did = false
function MyError() {
  if (!did && typeof window === 'undefined') {
    did = true
    throw new Error('oops')
  }
}

export default function page() {
  return (
    <>
      <h1>Hey Error</h1>
      <Suspense fallback="error-fallback">
        <MyError />
      </Suspense>
    </>
  )
}

export const config = {
  runtime: 'experimental-edge',
}
