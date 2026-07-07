import { Suspense } from 'react'
import { connection } from 'next/server'
import { DynamicRenderCounterClient, LeafContent } from './leaf-content'

async function DynamicRenderCounter() {
  // Renders a count of the number of times the client receives new dynamic data
  // from the server. The count is computed on the client and stored in React
  // state, so it gets reset if the state of the tree is reset.
  await connection()
  return <DynamicRenderCounterClient uuid={crypto.randomUUID()} />
}

export default function LeafPage() {
  return (
    <section>
      <Suspense fallback={null}>
        <DynamicRenderCounter />
      </Suspense>
      <LeafContent />
    </section>
  )
}
