import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <main>
      <p>This page awaits connection() without Suspense</p>
    </main>
  )
}
