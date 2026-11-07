import React from 'react'
import { cacheTag } from 'next/cache'
import Link from 'next/link'
import { connection } from 'next/server'

async function getCachedValue() {
  'use cache'
  cacheTag('revalidate-and-redirect')

  return Math.random()
}

async function getCachedValue2() {
  'use cache'
  return Math.random()
}

export default async function Page() {
  // Make the page dynamic, as we don't want to deal with ISR in this scenario.
  await connection()

  const a = await getCachedValue()
  const b = await getCachedValue()
  const c = await getCachedValue2()

  const timestamp = Date.now()

  return (
    <div>
      <p id="a">{a}</p>
      <p id="b">{b}</p>
      <p id="c">{c}</p>
      <div id="timestamp">{timestamp}</div>
      <Link href="/revalidate-and-redirect/redirect">
        Go to /revalidate-and-redirect/redirect
      </Link>
    </div>
  )
}
