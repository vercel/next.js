import { Suspense } from 'react'
import { Button } from './button'

async function CachedValue() {
  'use cache'

  return <p id="concrete-cached-value">{Math.random()}</p>
}

async function Destination({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <p id="concrete-destination">
      {`concrete destination page rendered: ${id}`}
    </p>
  )
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <CachedValue />
      <Suspense fallback={<p>loading concrete destination</p>}>
        <Destination params={params} />
      </Suspense>
      <Button />
    </>
  )
}
