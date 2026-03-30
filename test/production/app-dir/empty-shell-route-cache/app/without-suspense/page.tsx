import { connection } from 'next/server'

export const unstable_instant = false

export default async function Page() {
  await connection()
  return (
    <div>
      <h1>Without Suspense</h1>
      <p>Dynamic content rendered at request time</p>
    </div>
  )
}
