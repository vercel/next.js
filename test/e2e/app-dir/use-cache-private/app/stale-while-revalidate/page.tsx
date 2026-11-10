import { Suspense } from 'react'

async function getPrivateValue() {
  'use cache: private'
  return new Date().toISOString()
}

async function PrivateValue() {
  return <p id="value">{await getPrivateValue()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <PrivateValue />
    </Suspense>
  )
}
