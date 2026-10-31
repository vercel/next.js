import { lang, countryCode } from 'next/root-params'
import { unstable_cache } from 'next/cache'
import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  return (
    <Suspense fallback="Loading...">
      <Runtime />
    </Suspense>
  )
}

async function Runtime() {
  await connection()

  const getParams = unstable_cache(getCachedParams)
  const rootParams = await getParams()

  return (
    <p id="param">
      {rootParams.lang} {rootParams.countryCode}
    </p>
  )
}

async function getCachedParams() {
  'use cache'
  return { lang: await lang(), countryCode: await countryCode() }
}
