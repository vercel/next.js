import { connection } from 'next/server'
import { message } from './message'
import Counter from './counter'

export default async function Greeting({ label }: { label: string }) {
  await connection()
  return (
    <section>
      <h1>{await message(label)}</h1>
      <Counter />
    </section>
  )
}
