import { getCachedValue, CookieData } from '../../../cached-value'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { unstable_prefetch } from 'next/cache'

export default async function Page() {
  const cachedValue = await getCachedValue()
  // The tag is "original" during build and switches to "updated" after revalidation.
  const shouldUseCookiesInShell = cachedValue.tag !== 'original'
  return (
    <main>
      <h1>
        Partial page that uses cookies in the prefetch at build, but starts
        using them in the shell after a revalidation (which makes the shell
        become not static)
      </h1>

      <p>{`Cached value: ${cachedValue.tag}, cookies used in ${shouldUseCookiesInShell ? 'shell' : 'prefetch'}`}</p>
      {shouldUseCookiesInShell ? (
        <CookieData label="in shell" />
      ) : (
        <p>No cookies used in the shell</p>
      )}
      <Suspense
        fallback={
          <div id="prefetch-data-fallback">Loading prefetch data...</div>
        }
      >
        <PrefetchOnly>
          <div id="prefetch-data">Prefetch data</div>
          {!shouldUseCookiesInShell && <CookieData label="in prefetch" />}
        </PrefetchOnly>
      </Suspense>

      <Suspense
        fallback={<div id="dynamic-data-fallback">Loading dynamic data...</div>}
      >
        <DynamicData />
      </Suspense>
    </main>
  )
}

async function PrefetchOnly({ children }) {
  await unstable_prefetch()
  return children
}

async function DynamicData() {
  await connection()
  return <div id="dynamic-data">Dynamic data</div>
}
