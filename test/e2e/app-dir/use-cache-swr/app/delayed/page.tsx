import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function Cached() {
  'use cache'

  cacheLife('seconds')

  await setTimeout(1000)

  return <p id="cached">{new Date().toISOString()}</p>
}

export default async function Page() {
  await connection()

  return (
    <>
      <p id="dynamic">{new Date().toISOString()}</p>
      <Cached />
    </>
  )
}
