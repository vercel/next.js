import { lang } from 'next/root-params'
import { cacheTag, updateTag } from 'next/cache'
import { connection } from 'next/server'
import { Suspense } from 'react'

let flagValue = false

async function getFlag() {
  'use cache: remote'
  cacheTag('flag-tag')
  return flagValue
}

async function conditionalOnAnotherCache() {
  'use cache: remote'

  const random = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  const flag = await getFlag()
  if (flag) {
    return { lang: await lang(), random }
  }
  return { lang: null, random }
}

async function Runtime() {
  await connection()
  const result = await conditionalOnAnotherCache()

  return (
    <div>
      <p id="lang-value">{String(result.lang)}</p>
      <p id="random">{result.random}</p>
      <form>
        <button
          id="enable-flag"
          formAction={async () => {
            'use server'
            flagValue = true
            updateTag('flag-tag')
          }}
        >
          Enable flag
        </button>
        <button
          id="disable-flag"
          formAction={async () => {
            'use server'
            flagValue = false
            updateTag('flag-tag')
          }}
        >
          Disable flag
        </button>
      </form>
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
