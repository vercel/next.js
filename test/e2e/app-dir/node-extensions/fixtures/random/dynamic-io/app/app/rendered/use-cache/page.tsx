import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <ul>
      <li>
        <RandomValue />
      </li>
      <li>
        <RandomValue />
      </li>
    </ul>
  )
}

async function RandomValue() {
  return getCachedRandom()
}

async function getCachedRandom() {
  'use cache'
  return Math.random()
}
