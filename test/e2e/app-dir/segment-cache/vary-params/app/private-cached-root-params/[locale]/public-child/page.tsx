import { cacheLife } from 'next/cache'
import { locale } from 'next/root-params'
import { Suspense } from 'react'

export const prefetch = 'partial'

export default function Page() {
  return (
    <Suspense fallback="Loading locale...">
      <PrivateContent />
    </Suspense>
  )
}

async function PrivateContent() {
  'use cache: private'
  cacheLife({ stale: 60 })

  return <div id="private-root-param">{`Locale: ${await getLocale()}`}</div>
}

async function getLocale() {
  'use cache'
  return locale()
}
