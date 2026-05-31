import { Suspense } from 'react'
import { connection } from 'next/server'
import { readReconcile } from '../reconcile-store'
import { ReconcileTrigger } from './trigger'

async function Reconciled() {
  // connection() forces a fresh dynamic render, so each refresh re-reads the
  // cookie instead of showing a cached value.
  await connection()
  const value = await readReconcile()
  return <p data-testid="reconciled">{value}</p>
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p data-testid="reconciled">pending</p>}>
        <Reconciled />
      </Suspense>
      <ReconcileTrigger />
    </main>
  )
}
