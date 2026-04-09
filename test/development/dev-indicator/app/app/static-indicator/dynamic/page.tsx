import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

export default async function Page() {
  await connection()
  await setTimeout(100)

  return <p>This is a dynamic app router page.</p>
}
