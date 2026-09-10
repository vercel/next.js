import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { LinkAccordion } from '../components/link-accordion'

async function enableSyncIO() {
  'use server'
  const cookieStore = await cookies()
  cookieStore.set('sync-io-enabled', 'true')
}

async function CookieStatus() {
  const cookieStore = await cookies()
  const enabled = cookieStore.get('sync-io-enabled')?.value === 'true'
  return (
    <p id="sync-io-status">
      {enabled ? 'Sync IO enabled' : 'Sync IO disabled'}
    </p>
  )
}

export default function Page() {
  return (
    <>
      <h1>Hub A</h1>
      <form action={enableSyncIO}>
        <button id="enable-sync-io">Enable sync IO</button>
      </form>
      <Suspense fallback={<p>Loading cookie...</p>}>
        <CookieStatus />
      </Suspense>
      <LinkAccordion href="/uncached-time" prefetch={false}>
        Target
      </LinkAccordion>
    </>
  )
}
