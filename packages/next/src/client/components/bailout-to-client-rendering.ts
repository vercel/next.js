import { BailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { workAsyncStorage } from '../../server/app-render/work-async-storage.external'
import { postponeWithTracking } from '../../server/app-render/dynamic-rendering'
import { workUnitAsyncStorage } from '../../server/app-render/work-unit-async-storage.external'

export function bailoutToClientRendering(reason: string): void | never {
  const workStore = workAsyncStorage.getStore()

  if (workStore?.forceStatic || !workStore?.isStaticGeneration) {
    return
  }

  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workUnitStore) {
    if (workStore.isPrefetchRequest && workUnitStore.type === 'prerender-ppr') {
      postponeWithTracking(
        workStore.route,
        reason,
        workUnitStore.dynamicTracking
      )
    }
  } else {
    throw new BailoutToCSRError(reason)
  }
}
