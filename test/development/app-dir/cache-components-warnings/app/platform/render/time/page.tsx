import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <dl>
      <dt>Current Date (`Date()`):</dt>
      <dd>{Date()}</dd>
      <dt>Current Date (`new Date().toString()`):</dt>
      <dd>{new Date().toString()}</dd>
      <dt>Current Timestamp (`Date.now()`):</dt>
      <dd>{Date.now()}</dd>
      <dt>Current Timestamp (`performance.now()`):</dt>
      <dd>{performance.now()}</dd>
    </dl>
  )
}
