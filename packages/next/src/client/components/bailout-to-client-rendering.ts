import { throwWithNoSSR } from '../../shared/lib/lazy-dynamic/no-ssr-error'
import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'

export function bailoutToClientRendering(): boolean | never {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  if (staticGenerationStore?.forceStatic) {
    return true
  }

  if (staticGenerationStore?.isStaticGeneration) {
    throwWithNoSSR()
  }

  return false
}
