import { BailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { workAsyncStorage } from '../../server/app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../../server/app-render/work-unit-async-storage.external'

export function bailoutToClientRendering(reason: string): void | never {
  const workStore = workAsyncStorage.getStore()

  if (workStore?.forceStatic) return

  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'prerender-ppr':
      case 'prerender-legacy':
        throw new BailoutToCSRError(reason)
      default:
    }
  }
}
