import { connection } from 'next/server'

export default async function ParallelPage() {
  // connection() required for Date.now() with Cache Components
  await connection()
  return (
    <>
      <p>Hello from nested parallel page!</p>
      <div id="timestamp">{Date.now()}</div>
    </>
  )
}
