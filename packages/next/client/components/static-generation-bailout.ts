import { DynamicServerError } from './hooks-server-context'
import { staticGenerationAsyncStorage } from './static-generation-async-storage'

export function staticGenerationBailout(reason: string) {
  const staticGenerationStore =
    staticGenerationAsyncStorage && 'getStore' in staticGenerationAsyncStorage
      ? staticGenerationAsyncStorage?.getStore()
      : staticGenerationAsyncStorage

  if (staticGenerationStore?.isStaticGeneration) {
    // TODO: honor the dynamic: 'force-static'
    if (staticGenerationStore) {
      staticGenerationStore.fetchRevalidate = 0
    }
    throw new DynamicServerError(reason)
  }
}
