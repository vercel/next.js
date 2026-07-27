import { Suspense } from 'react'

async function PrivateData() {
  'use cache: private'
  await new Promise((resolve) => setTimeout(resolve, 100))
  return <p id="private">{Math.random()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <PrivateData />
    </Suspense>
  )
}
