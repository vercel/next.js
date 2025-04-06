import { Suspense } from 'react'

function MyError() {
  if (typeof window === 'undefined') {
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
