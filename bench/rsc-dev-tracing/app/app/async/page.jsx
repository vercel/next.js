import { Suspense } from 'react'
import { connection } from 'next/server'

async function AsyncLeaf({ index }) {
  await Promise.resolve(index)
  await Promise.resolve(index + 1)
  return <span data-index={index}>async-{index}</span>
}

function AsyncList() {
  const leaves = []
  for (let index = 0; index < 500; index++) {
    leaves.push(<AsyncLeaf key={index} index={index} />)
  }

  return <div>{leaves}</div>
}

async function DynamicAsyncList() {
  await connection()

  return <AsyncList />
}

export default function AsyncPage() {
  return (
    <main>
      <h1>Async RSC route</h1>
      <Suspense fallback={<p>Loading async route...</p>}>
        <DynamicAsyncList />
      </Suspense>
    </main>
  )
}
