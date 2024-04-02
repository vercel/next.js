import { Suspense } from 'react'

export const revalidate = 3

async function RandomSuspenseResolve() {
  await new Promise((resolve) => {
    setTimeout(resolve, Math.random() * 5_000)
  })
  return <p>hello world</p>
}

export default function Page() {
  console.log('rendering /variable-revalidate-stable/revalidate-3')
  return (
    <>
      <p>Testing etag...</p>
      <Suspense fallback={'Loading...'}>
        <RandomSuspenseResolve />
      </Suspense>
      <Suspense fallback={'Loading...'}>
        <RandomSuspenseResolve />
      </Suspense>
      <Suspense fallback={'Loading...'}>
        <RandomSuspenseResolve />
      </Suspense>
    </>
  )
}
