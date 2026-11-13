import { Suspense } from 'react'
import { lang } from 'next/root-params'
import { cacheTag } from 'next/cache'
import { randomUUID } from 'node:crypto'

async function ShellVersion() {
  'use cache'
  cacheTag('root-fallback-shell')
  return <p id="shell-version">{randomUUID()}</p>
}

async function cachedLanguage() {
  'use cache'
  return (await lang()).toUpperCase()
}

async function NestedLanguage() {
  'use cache'
  return <p id="nested-lang">{'nested:' + (await cachedLanguage())}</p>
}

async function DirectLanguage() {
  return <p id="direct-lang">{await lang()}</p>
}

async function CachedBoundary() {
  'use cache'
  return (
    <>
      <p id="cache-prefix">Cached language UI</p>
      <Suspense fallback={<p id="inner-pending">language pending</p>}>
        <DirectLanguage />
      </Suspense>
    </>
  )
}

export default function Page() {
  return (
    <>
      <ShellVersion />
      <Suspense fallback={<p id="nested-pending">nested language pending</p>}>
        <NestedLanguage />
      </Suspense>
      <Suspense fallback={<p id="outer-pending">cached UI pending</p>}>
        <CachedBoundary />
      </Suspense>
    </>
  )
}
