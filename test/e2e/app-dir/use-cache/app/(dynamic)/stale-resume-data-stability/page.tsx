import { cacheLife } from 'next/cache'
import { connection } from 'next/server'

async function getValue() {
  'use cache'
  cacheLife({ stale: 0, revalidate: 1, expire: 60 })

  return Date.now()
}

export default async function Page() {
  await connection()

  const firstValue = await getValue()

  // Let background revalidation finish before reading this cache again in the
  // same request. The request should continue to observe its original stale
  // Resume Data Cache entry, even though future requests can use the new value.
  await new Promise((resolve) => setTimeout(resolve, 250))

  const secondValue = await getValue()

  return <p id="values">{firstValue}|{secondValue}</p>
}
