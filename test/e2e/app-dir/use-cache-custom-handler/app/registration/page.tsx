import { cacheTag } from 'next/cache'
import { connection } from 'next/server'

async function getData() {
  'use cache'
  cacheTag('registration')
  return 'registration'
}

export default async function Page() {
  await connection()
  return <p id="data">{await getData()}</p>
}
