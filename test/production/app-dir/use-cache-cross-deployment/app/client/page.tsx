import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { getDate } from '../logic'
import Client from './client'

async function DynamicCache({ id }: { id: string }) {
  'use cache: remote'
  cacheLife('days')
  return <Client>{getDate()}</Client>
}

export default async function Page() {
  await connection()

  return (
    <main>
      <Suspense>
        <DynamicCache id="dynamic-cache" />
      </Suspense>
    </main>
  )
}
