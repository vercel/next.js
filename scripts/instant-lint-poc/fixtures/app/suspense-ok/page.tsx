// Expect: INSTANT — the blocking work lives in a child component (in another
// file) rendered below <Suspense>, so it becomes a PPR hole, not a blocker.
import { Suspense } from 'react'
import { Transactions } from './transactions'

export default function Page() {
  return (
    <main>
      <h1>Dashboard</h1>
      <Suspense fallback={<p>Loading transactions…</p>}>
        <Transactions />
      </Suspense>
    </main>
  )
}
