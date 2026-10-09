import { Suspense } from 'react'

async function LevelTwo() {
  await new Promise((resolve) => setTimeout(resolve, 150))
  return (
    <div style={{ marginTop: '800px', height: '600px' }}>
      <h2 id="nested-target">Nested Target Heading</h2>
    </div>
  )
}

async function LevelOne() {
  await new Promise((resolve) => setTimeout(resolve, 100))
  return (
    <div style={{ marginTop: '500px' }}>
      <Suspense fallback={<p>Loading inner level...</p>}>
        <LevelTwo />
      </Suspense>
    </div>
  )
}

export default function NestedSuspensePage() {
  return (
    <main style={{ padding: '20px' }}>
      <h1>Nested Suspense Page</h1>
      <div style={{ height: '600px', background: '#ececec' }}>
        <p>Outer spacer</p>
      </div>
      <Suspense fallback={<p>Loading outer level...</p>}>
        <LevelOne />
      </Suspense>
    </main>
  )
}
