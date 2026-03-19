import { lang, countryCode } from 'next/root-params'
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

  const result = await getCachedData()

  return (
    <p>
      <span id="param">
        {result.lang} {result.countryCode}
      </span>{' '}
      <span id="random">{result.random}</span>
    </p>
  )
}

async function getCachedData() {
  'use cache: remote'

  const random = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  return { lang: await lang(), countryCode: await countryCode(), random }
}
