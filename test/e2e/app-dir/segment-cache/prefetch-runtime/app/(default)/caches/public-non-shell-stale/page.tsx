import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../shared'
import { cacheLife } from 'next/cache'
import { ForceRuntimeShell } from '../../../../components/force-runtime-shell'

export const instant = true
export const prefetch = 'partial'

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />

      {/*
      A page that uses public caches that are excluded from the shell can still be
      statically prerendered, so we have to force it to use runtime requests instead.
       */}
      <ForceRuntimeShell />

      <p id="intro">
        This page uses a public cache (stale &lt; MIN_SHELL_STALE, 5min), which
        should not be included in a runtime shell, but it should be included in
        a runtime prefetch.
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading...</div>}>
        <NonShellCache />
      </Suspense>
    </main>
  )
}

async function NonShellCache() {
  'use cache'
  cacheLife({
    stale: 5 * 60 - 1, // < MIN_SHELL_STALE
  })
  await cachedDelay([__filename])

  return <div id="cached-value">Non-shell cached content</div>
}
