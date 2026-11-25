import { Suspense } from 'react'
import Image from 'next/image'
import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { getDate } from '../logic'

async function DynamicCache() {
  'use cache: remote'
  cacheLife('days')

  return (
    <>
      <Image
        id="cached-image"
        src="/vercel.svg"
        alt="Vercel Logo"
        width={72}
        height={16}
      />
      <span id="data">{getDate()}</span>
    </>
  )
}

export const instant = false

export default async function Page() {
  await connection()

  return (
    <main>
      <Suspense>
        <DynamicCache />
      </Suspense>
    </main>
  )
}
