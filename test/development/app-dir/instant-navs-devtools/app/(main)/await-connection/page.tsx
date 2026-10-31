import { connection } from 'next/server'

export default async function TargetPage() {
  await connection()

  return (
    <div>
      <h1>Target Page</h1>
      <div data-testid="dynamic-content">Dynamic content loaded</div>
    </div>
  )
}
