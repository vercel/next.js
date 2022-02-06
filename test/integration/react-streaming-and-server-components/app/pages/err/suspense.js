import { Suspense } from 'react'

let did = false
function Error() {
  if (!did && typeof window === 'undefined') {
    did = true
    throw new Error('broken page')
  }
}

export default function page() {
  return (
    <>
      <h1>Hey Error</h1>
      <Suspense>
        <Error />
      </Suspense>
    </>
  )
}
