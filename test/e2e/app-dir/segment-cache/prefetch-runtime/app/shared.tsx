import { unstable_cacheLife } from 'next/cache'
import { setTimeout } from 'timers/promises'

export async function uncachedIO() {
  await setTimeout(500)
}

export async function cachedDelay(time: number, cacheBuster?: any) {
  'use cache'
  unstable_cacheLife('minutes')
  console.log('cachedDelay', time, cacheBuster)
  await setTimeout(time)
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
