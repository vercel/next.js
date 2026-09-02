import { Suspense } from 'react'
import { Button } from './button'
import { getCachedValue } from './cached-value'

async function CachedValue() {
  return <p id="cached-value">{await getCachedValue()}</p>
}

async function EventId({ params }: { params: Promise<{ id: string }> }) {
  return <p id="event-id">{(await params).id}</p>
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <p>destination page rendered</p>
      <CachedValue />
      <Suspense fallback={<p>loading event</p>}>
        <EventId params={params} />
      </Suspense>
      <Button />
    </>
  )
}
