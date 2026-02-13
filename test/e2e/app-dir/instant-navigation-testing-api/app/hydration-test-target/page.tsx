import { connection } from 'next/server'

export default async function HydrationTestTargetPage() {
  await connection()

  return (
    <div>
      <h1>Hydration Test Target</h1>
      <div data-testid="hydration-test-dynamic">Dynamic content loaded</div>
    </div>
  )
}
