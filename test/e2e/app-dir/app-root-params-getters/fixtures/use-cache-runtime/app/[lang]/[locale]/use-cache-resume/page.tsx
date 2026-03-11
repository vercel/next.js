import { lang, locale } from 'next/root-params'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function getCachedData() {
  'use cache'

  const random = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  return { lang: await lang(), locale: await locale(), random }
}

export default async function Page() {
  const result = await getCachedData()

  return (
    <>
      <p>
        <span id="param">
          {result.lang} {result.locale}
        </span>{' '}
        <span id="random">{result.random}</span>
      </p>
      <Suspense fallback={<p id="fallback">Loading...</p>}>
        <Dynamic />
      </Suspense>
    </>
  )
}

async function Dynamic() {
  await connection()
  return <p id="dynamic">dynamic</p>
}
