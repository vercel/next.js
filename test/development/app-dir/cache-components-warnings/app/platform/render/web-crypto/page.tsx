import { connection } from 'next/server'

export default async function Page() {
  await connection()
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return (
    <dl>
      <dt>crypto.getRandomValues():</dt>
      <dd>{arr.toString()}</dd>
      <dt>crypto.randomUUID():</dt>
      <dd>{crypto.randomUUID()}</dd>
    </dl>
  )
}
