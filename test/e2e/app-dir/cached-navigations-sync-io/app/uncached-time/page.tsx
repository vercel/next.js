import { cacheLife } from 'next/cache'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LinkAccordion } from '../../components/link-accordion'

async function isSyncIOEnabled() {
  'use cache: private'
  cacheLife({ stale: 120 })
  const cookieStore = await cookies()
  return cookieStore.get('sync-io-enabled')?.value === 'true'
}

async function Timestamp() {
  // The private cache suspends during static prerendering. A staged dynamic
  // render can resolve it during the static stage. The uncached timestamp must
  // end that stage.
  const enabled = await isSyncIOEnabled()
  if (!enabled) {
    return <p>Sync IO disabled</p>
  }
  return <p id="timestamp">Uncached time: {Date.now()}</p>
}

async function DynamicContent() {
  await connection()
  return <p>Dynamic content</p>
}

export default function Page() {
  return (
    <>
      <h1>Sync IO target</h1>
      <Suspense fallback={<p>Loading timestamp...</p>}>
        <Timestamp />
      </Suspense>
      <Suspense fallback={<p>Loading dynamic content...</p>}>
        <DynamicContent />
      </Suspense>
      <LinkAccordion href="/hub-b" prefetch={false}>
        Hub B
      </LinkAccordion>
    </>
  )
}
