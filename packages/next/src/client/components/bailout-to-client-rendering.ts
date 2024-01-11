import { BailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'

export function bailoutToClientRendering(reason: string): void | never {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  if (staticGenerationStore?.forceStatic) return

  if (staticGenerationStore?.isStaticGeneration)
    throw new BailoutToCSRError(reason)
}
