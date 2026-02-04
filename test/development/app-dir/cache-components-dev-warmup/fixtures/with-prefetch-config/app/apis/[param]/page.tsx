import { cookies, headers } from 'next/headers'
import { CachedData } from '../../data-fetching'
import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_prefetch = { mode: 'runtime', samples: [{}] }

const CACHE_KEY = __dirname + '/__PAGE__'

export default function Page({ params, searchParams }) {
  return (
    <main>
      <p>
        This page checks whether runtime/dynamic APIs resolve in the correct
        stage (regardless of whether we had a cache miss or not)
      </p>
      <CachedData cacheKey={CACHE_KEY} label="page" />
      <LogAfter label="--- dynamic stage ---" api={() => connection()} />

      {/* Runtime */}
      <LogAfter label="cookies" api={() => cookies()} />
      <LogAfter label="headers" api={() => headers()} />
      <LogAfter label="params" api={() => params} />
      <LogAfter label="searchParams" api={() => searchParams} />
      {/* Dynamic */}
      <LogAfter label="connection" api={() => connection()} />
    </main>
  )
}

function LogAfter({ label, api }: { label: string; api: () => Promise<any> }) {
  return (
    <Suspense fallback={<div>Waiting for {label}...</div>}>
      <LogAfterInner label={label} api={api} />
    </Suspense>
  )
}

async function LogAfterInner({
  label,
  api,
}: {
  label: string
  api: () => Promise<any>
}) {
  await api()
  console.log(`after ${label}`)
  return <div>Finished {label}</div>
}
