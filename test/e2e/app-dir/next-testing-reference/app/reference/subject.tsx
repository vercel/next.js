import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { serverMessage } from '../../lib/server-message'
import { Counter } from './counter'

async function NestedMessage() {
  return <p id="nested-message">{await serverMessage()}</p>
}

export async function ReferenceSubject() {
  await connection()
  const visitor =
    (await cookies()).get('reference-visitor')?.value ?? 'anonymous'
  return (
    <section id="completed">
      <p id="visitor">{visitor}</p>
      <NestedMessage />
      <Counter initial={10} />
    </section>
  )
}
