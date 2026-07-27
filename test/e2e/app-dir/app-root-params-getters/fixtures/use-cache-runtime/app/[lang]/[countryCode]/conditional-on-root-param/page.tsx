import { lang, countryCode } from 'next/root-params'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function conditionalOnRootParam() {
  'use cache: remote'

  const random = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  const currentLang = await lang()
  if (currentLang === 'en') {
    return { lang: currentLang, countryCode: await countryCode(), random }
  }
  return { lang: currentLang, countryCode: null, random }
}

async function Runtime() {
  await connection()
  const result = await conditionalOnRootParam()

  return (
    <div>
      <p id="lang-value">{String(result.lang)}</p>
      <p id="country-code-value">{String(result.countryCode)}</p>
      <p id="random">{result.random}</p>
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
