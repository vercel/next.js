import { Suspense } from 'react'

async function privateData() {
  'use cache: private'
  return Math.random()
}

async function Content() {
  return <p>{await privateData()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content />
    </Suspense>
  )
}
