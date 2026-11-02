import { connection } from 'next/server'

// Request-time data that takes far longer than the tests allow.
export async function Slow() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 30_000))
  return <p id="slow">Slow data</p>
}
