import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function PrivateCached() {
  'use cache: private'
  await setTimeout(1000)
  return <p className="rand">{Math.random()}</p>
}

export default async function Page() {
  await connection()

  return <PrivateCached />
}
