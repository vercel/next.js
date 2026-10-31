import { lang } from 'next/root-params'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function maybeReadsRootParam(readLang: boolean) {
  'use cache: remote'

  const random = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  if (readLang) {
    return { lang: await lang(), random }
  }

  return { lang: null, random }
}

async function Runtime() {
  await connection()

  // The `true` call must come first so that `saveToCacheHandler` adds `lang`
  // to `knownRootParamsByFunctionId` before the `false` call's lookup runs.
  const withLang = await maybeReadsRootParam(true)
  const withoutLang = await maybeReadsRootParam(false)

  return (
    <div>
      <p id="with-lang-random">{withLang.random}</p>
      <p id="with-lang-value">{String(withLang.lang)}</p>
      <p id="without-lang-random">{withoutLang.random}</p>
      <p id="without-lang-value">{String(withoutLang.lang)}</p>
    </div>
  )
}

export default async function Page() {
  return (
    <Suspense fallback="Loading...">
      <Runtime />
    </Suspense>
  )
}
