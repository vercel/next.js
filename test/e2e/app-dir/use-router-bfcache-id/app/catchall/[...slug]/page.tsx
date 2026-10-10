import { Suspense } from 'react'
import { connection } from 'next/server'
import { LeafContent } from '../../[group]/[page]/leaf-content'

async function DynamicLeafContent() {
  await connection()
  return <LeafContent />
}

export default function CatchAllPage() {
  return (
    <Suspense fallback={null}>
      <DynamicLeafContent />
    </Suspense>
  )
}
