import { cacheTag, revalidateTag, unstable_prefetch } from 'next/cache'

import * as fs from 'node:fs'
import { Suspense } from 'react'
import { cookies } from 'next/headers'

// value.json at the root of the app
let CACHE_FILE: string
if (process.env.CACHE_FILE) {
  // allow overriding, because that can be useful when running the app directly
  CACHE_FILE = process.env.CACHE_FILE
} else {
  // resolving a relative path seems strangely difficult to do consistently
  // in a way that works both when running the app directly and when running
  // it in tests, so we rely on the app root being at CWD instead
  CACHE_FILE = process.cwd() + '/value.json'
  if (!fs.existsSync(CACHE_FILE)) {
    throw new Error(
      `Cache file not found at ${CACHE_FILE}. This app must run with its root as CWD or provide a path to a cache file via the CACHE_FILE environment variable`
    )
  }
}

const CACHE_TAG = 'cache-value'

export type Value = { tag: 'original' | 'updated'; timestamp: number }

export async function updateCachedValue(): Promise<Value> {
  const newValue: Value = { tag: 'updated', timestamp: Date.now() }
  writeNewValue(newValue)
  return newValue
}

export async function resetCachedValue(): Promise<Value> {
  const newValue: Value = { tag: 'original', timestamp: -1 }
  writeNewValue(newValue)
  return newValue
}

function writeNewValue(value: Value) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(value))
  revalidateTag(CACHE_TAG, { expire: 0 })
}

export async function getCachedValue(): Promise<Value> {
  'use cache'
  cacheTag(CACHE_TAG)
  const value: Value = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
  return value
}

export async function ConditionalCookies() {
  const cachedValue = await getCachedValue()
  // The tag is "original" during build and switches to "updated" after revalidation.
  const shouldUseCookies = cachedValue.tag !== 'original'
  return (
    <div>
      <p>{`Cached value: ${cachedValue.tag}, cookies used: ${shouldUseCookies}`}</p>
      {shouldUseCookies && (
        <Suspense
          fallback={<div id="cookie-data-fallback">Loading cookie data...</div>}
        >
          <CookieData />
        </Suspense>
      )}
    </div>
  )
}

async function CookieData() {
  await cookies()
  return (
    <>
      <div id="cookie-data">Cookie data</div>
      <Suspense
        fallback={
          <div id="cookies-runtime-prefetch-data-fallback">
            Loading runtime prefetch data... (behind cookies)
          </div>
        }
      >
        <RuntimePrefetchData />
      </Suspense>
    </>
  )
}

async function RuntimePrefetchData() {
  await unstable_prefetch()
  return (
    <div id="cookies-runtime-prefetch-data">
      Runtime prefetch data (behind cookies)
    </div>
  )
}
