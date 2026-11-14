import { Suspense } from 'react'
import { connection } from 'next/server'

async function Content({ count }: { count: number }) {
  await connection()
  return (
    <ul id="items">
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>{`${index}: ${'x'.repeat(100)}`}</li>
      ))}
    </ul>
  )
}

export function Fixture({ count }: { count: number }) {
  return (
    <main>
      <Suspense fallback={<p id="fallback">Loading</p>}>
        <Content count={count} />
      </Suspense>
    </main>
  )
}
