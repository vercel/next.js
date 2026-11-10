import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind, uncachedIO } from '../../../../shared'
import { connection } from 'next/server'
import { lang } from 'next/root-params'
import { cookies } from 'next/headers'
import { ForceRuntimeShell } from '../../../../../components/force-runtime-shell'
import { PrefetchContent } from '../../../../../components/prefetch-content'

export const instant = {
  unstable_samples: [{ params: { lang: 'en' } }],
}

export default async function Page() {
  return (
    <main>
      <ForceRuntimeShell />
      <DebugRenderKind />
      <p>
        This page uses root params and some uncached IO. Root params should
        always be available in static prerenders, so a runtime prefetch should
        have them too.
      </p>
      <Suspense fallback="Loading 1...">
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  await cookies()

  const currentLang = await lang()
  await cachedDelay([__filename, currentLang])
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="root-param-value">{`Lang: ${currentLang}`}</div>
      <PrefetchContent text={`Lang (in prefetch): ${currentLang}`} />
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

async function Dynamic() {
  await uncachedIO()
  await connection()
  return (
    <div style={{ border: '1px solid tomato', padding: '1em' }}>
      <div id="dynamic-content">Dynamic content</div>
    </div>
  )
}
