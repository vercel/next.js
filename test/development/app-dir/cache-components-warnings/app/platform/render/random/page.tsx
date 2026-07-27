import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <dl>
      <dt>Random number (`Math.random()`):</dt>
      <dd>{Math.random()}</dd>
    </dl>
  )
}
