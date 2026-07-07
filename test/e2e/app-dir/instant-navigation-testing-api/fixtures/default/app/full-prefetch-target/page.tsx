import { connection } from 'next/server'

export default async function FullPrefetchTargetPage() {
  await connection()

  return (
    <div>
      <h1>Full Prefetch Target</h1>
      <div data-testid="full-prefetch-content">
        Full prefetch content loaded
      </div>
    </div>
  )
}
