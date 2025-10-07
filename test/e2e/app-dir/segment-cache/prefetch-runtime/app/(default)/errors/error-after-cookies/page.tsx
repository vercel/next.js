import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../shared'
import { ErrorBoundary } from '../../../../components/error-boundary'

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p id="intro">
        This page errors after a cookies call, so we should only see the error
        in a runtime prefetch or a navigation (and not during prerendering /
        prefetching)
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <ErrorBoundary>
          <One />
        </ErrorBoundary>
      </Suspense>
    </main>
  )
}

async function One(): Promise<never> {
  const cookieStore = await cookies()
  await cachedDelay(['/cookies', cookieStore.get('user-agent')?.value])
  throw new Error('Kaboom')
}
