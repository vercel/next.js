import { Suspense } from 'react'
import { connection } from 'next/server'

function SyncLeaf({ index }) {
  return <span data-index={index}>sync-{index}</span>
}

function SyncList() {
  const leaves = []
  for (let index = 0; index < 500; index++) {
    leaves.push(<SyncLeaf key={index} index={index} />)
  }

  return <div>{leaves}</div>
}

async function DynamicSyncRoute() {
  await connection()

  return (
    <main>
      <h1>Sync RSC route</h1>
      <SyncList />
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading sync route...</p>}>
      <DynamicSyncRoute />
    </Suspense>
  )
}
