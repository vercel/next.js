import { BailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { staticGenerationAsyncStorage } from './work-async-storage.external'

export function bailoutToClientRendering(reason: string): void | never {
  const workStore = staticGenerationAsyncStorage.getStore()

  if (workStore?.forceStatic) return

  if (workStore?.isStaticGeneration) throw new BailoutToCSRError(reason)
}
