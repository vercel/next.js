import { cacheLife, cacheTag } from 'next/cache'
import { lang, countryCode } from 'next/root-params'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

type Props = { searchParams: Promise<{ key?: string | string[] }> }

export default function Page(props: Props) {
  return (
    <Suspense fallback="Loading...">
      <Runtime {...props} />
    </Suspense>
  )
}

async function Runtime({ searchParams }: Props) {
  await connection()
  const { key } = await searchParams
  if (typeof key !== 'string' || !key) {
    throw new Error('A query key is required')
  }
  const result = await getCachedData(key)
  return (
    <p>
      <span id="lang">{result.lang}</span>
      <span id="country-code">{result.countryCode}</span>
      <span id="value">{result.value}</span>
    </p>
  )
}

async function getCachedData(key: string) {
  'use cache: remote'

  cacheLife('days')
  const roots = { lang: await lang(), countryCode: await countryCode() }
  cacheTag(`swr:${key}:${roots.lang}:${roots.countryCode}`)
  console.log(`swr start ${key} ${roots.lang}/${roots.countryCode}`)
  await setTimeout(1000)
  console.log(`swr finish ${key} ${roots.lang}/${roots.countryCode}`)
  return { ...roots, value: new Date().toISOString() }
}
