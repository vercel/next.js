import { createIpcServer } from './server-ipc'
import { IncrementalCache } from './incremental-cache'

let initializeResult:
  | undefined
  | {
      ipcPort: number
      ipcValidationKey: string
    }

export async function initialize(
  ...constructorArgs: ConstructorParameters<typeof IncrementalCache>
): Promise<NonNullable<typeof initializeResult>> {
  const incrementalCache = new IncrementalCache(...constructorArgs)

  const { ipcPort, ipcValidationKey } = await createIpcServer({
    async revalidateTag(
      ...args: Parameters<IncrementalCache['revalidateTag']>
    ) {
      return incrementalCache.cacheHandler?.revalidateTag?.(...args)
    },

    async fetchCacheKey(
      ...args: Parameters<IncrementalCache['fetchCacheKey']>
    ) {
      return incrementalCache.fetchCacheKey(...args)
    },

    async get(...args: Parameters<IncrementalCache['get']>) {
      return incrementalCache.get(...args)
    },

    async set(...args: Parameters<IncrementalCache['set']>) {
      return incrementalCache.set(...args)
    },
  } as any)

  return {
    ipcPort,
    ipcValidationKey,
  }
}
