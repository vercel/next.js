import { Metadata } from 'next'
import { connection } from 'next/server'
import { getCachedData } from './cached-data'

export async function generateMetadata(): Promise<Metadata> {
  // TODO: Deduping with nested caches requires #78703.
  // 'use cache'

  await connection()

  return {
    description: new Date().toISOString(),
    title: await getCachedData(),
  }
}

export default async function Page() {
  await connection()

  return (
    <>
      <h2>Page</h2>
      <p id="page-data">{await getCachedData()}</p>
    </>
  )
}
