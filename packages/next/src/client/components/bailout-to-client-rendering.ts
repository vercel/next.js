import { BailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { workAsyncStorage } from '../../server/app-render/work-async-storage.external'

export function bailoutToClientRendering(reason: string): void | never {
  const workStore = workAsyncStorage.getStore()

  if (workStore?.forceStatic) return

  if (workStore?.isStaticGeneration) throw new BailoutToCSRError(reason)
}
