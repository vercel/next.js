import { DynamicServerError } from './hooks-server-context'
import { staticGenerationAsyncStorage } from './static-generation-async-storage'

export function staticGenerationBailout(reason: string): boolean | never {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  if (staticGenerationStore?.forceStatic) {
    return true
  }

  if (staticGenerationStore?.isStaticGeneration) {
    if (staticGenerationStore) {
      staticGenerationStore.fetchRevalidate = 0
    }
    throw new DynamicServerError(reason)
  }

  return false
}
