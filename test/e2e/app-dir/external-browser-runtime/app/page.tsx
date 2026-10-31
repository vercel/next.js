import { Suspense } from 'react'
import { connection } from 'next/server'
import { Counter } from './counter'

async function Slow() {
  // Dynamic access lives inside the boundary so the shell can still be
  // prerendered. With Cache Components that makes this a PPR route: the shell is
  // prerendered and this subtree is resumed per request, which exercises React's
  // `resume` path. Without Cache Components the whole route is dynamic. Either
  // way the shell flushes before this resolves, so React has to stream a
  // "complete boundary" instruction, which is what the external runtime applies.
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return <p id="slow">slow content</p>
}

export default function Page() {
  return (
    <>
      <p id="shell">hello world</p>
      <Suspense fallback={<p id="fallback">loading...</p>}>
        <Slow />
      </Suspense>
      <Counter />
    </>
  )
}
