import { connection } from 'next/server'

export default async function TargetPage() {
  await connection()

  return <div data-testid="dynamic-content">Dynamic content loaded</div>
}
