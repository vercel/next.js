import { DynamicServerError } from './hooks-server-context'
import { staticGenerationAsyncStorage } from './static-generation-async-storage'

export function staticGenerationBailout(reason: string): boolean | never {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  if (staticGenerationStore?.forceStatic) {
    return true
  }

  if (staticGenerationStore?.isStaticGeneration) {
    staticGenerationStore.revalidate = 0
    const err = new DynamicServerError(reason)

    staticGenerationStore.dynamicUsageDescription = reason
    staticGenerationStore.dynamicUsageStack = err.stack

    throw err
  }

  return false
}
