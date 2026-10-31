import { connection } from 'next/server'

export default async function SlowPage() {
  await connection()
  // Slow enough that the test can observe the address bar synchronously
  // after clicking, before this navigation commits.
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return (
    <main>
      <h1 id="slow-content">slow page</h1>
    </main>
  )
}
