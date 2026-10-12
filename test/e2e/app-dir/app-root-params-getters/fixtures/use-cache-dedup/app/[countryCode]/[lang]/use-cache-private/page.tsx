import { countryCode, lang } from 'next/root-params'
import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function getCachedData() {
  'use cache: private'

  // Simulate I/O latency so concurrent requests overlap.
  await setTimeout(1000)

  return {
    countryCode: await countryCode(),
    lang: await lang(),
    random: Math.random(),
  }
}

export default async function Page() {
  await connection()

  const result = await getCachedData()

  return (
    <p>
      <span id="country">{result.countryCode}</span>{' '}
      <span id="lang">{result.lang}</span>{' '}
      <span id="random">{result.random}</span>
    </p>
  )
}
