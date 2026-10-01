import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { getDate } from '../logic'
import { Client } from '../import-use-client/client'

async function InnerCache() {
  'use cache: remote'
  cacheLife('days')
  return <Client>{getDate()}</Client>
}

async function OuterCache() {
  'use cache: remote'
  cacheLife('days')
  return InnerCache()
}

export const instant = false

export default async function Page() {
  await connection()

  return (
    <main>
      <Suspense>
        <OuterCache />
      </Suspense>
    </main>
  )
}
