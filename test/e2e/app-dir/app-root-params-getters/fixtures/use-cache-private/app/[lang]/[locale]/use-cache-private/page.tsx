import { lang, locale } from 'next/root-params'
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

  const rootParams = await getCachedParams()
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  return (
    <p>
      <span id="param">
        {rootParams.lang} {rootParams.locale}
      </span>{' '}
      <span id="random">{data}</span>
    </p>
  )
}

async function getCachedParams() {
  'use cache: private'
  return { lang: await lang(), locale: await locale() }
}
