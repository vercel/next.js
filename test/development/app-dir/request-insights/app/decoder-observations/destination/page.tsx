import { randomUUID } from 'node:crypto'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { rerender } from './actions'

async function DecoderObservedContent() {
  await connection()
  return (
    <>
      <p id="decoder-generation">{randomUUID()}</p>
      <form action={rerender}>
        <button id="decoder-rerender">Observe action rerender</button>
      </form>
    </>
  )
}

export default function DecoderObservationDestinationPage() {
  return (
    <Suspense fallback={<p>Loading observed content</p>}>
      <DecoderObservedContent />
    </Suspense>
  )
}
