import { connection } from 'next/server'
import { cacheLife } from 'next/cache'
import Link from 'next/link'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

export function HackilyPreventFullyStaticServerPrerender() {
  // FIXME(NAR-800)
  return <Suspense>{connection().then(() => null)}</Suspense>
}

export function RootLayoutTimestamp() {
  const timestamp = performance.timeOrigin + performance.now()
  return <div id="root-layout-timestamp">{timestamp}</div>
}

export function DebugLinks({ href }: { href: string }) {
  return (
    <span>
      <span>{href}</span>{' '}
      <Link data-link-type="soft" href={href}>
        [SPA]
      </Link>{' '}
      <a data-link-type="hard" href={href}>
        [MPA]
      </a>
    </span>
  )
}

export async function uncachedIO() {
  await setTimeout(0)
}

export async function cachedDelay(key: any) {
  'use cache'
  cacheLife('minutes')
  await setTimeout(1)
}

export function DebugRenderKind() {
  const { workUnitAsyncStorage } =
    require('next/dist/server/app-render/work-unit-async-storage.external') as typeof import('next/dist/server/app-render/work-unit-async-storage.external')
  const workUnitStore = workUnitAsyncStorage.getStore()!
  return (
    <div>
      workUnitStore.type: {workUnitStore.type}
      {(() => {
        switch (workUnitStore.type) {
          case 'prerender':
            return '(static prefetch)'
          case 'prerender-runtime':
            return '(runtime prefetch)'
          default:
            return null
        }
      })()}
    </div>
  )
}
