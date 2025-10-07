import { Suspense } from 'react'
import { lang, locale } from 'next/root-params'
import { connection } from 'next/server'
import { unstable_cache } from 'next/cache'

export default async function Page() {
  return (
    <Suspense fallback="...">
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

const getCachedParams = unstable_cache(async () => {
  return { lang: await lang(), locale: await locale() }
})
