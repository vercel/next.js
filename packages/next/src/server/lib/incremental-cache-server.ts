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
      return incrementalCache.revalidateTag(...args)
    },

    async get(...args: Parameters<IncrementalCache['get']>) {
      return incrementalCache.get(...args)
    },

    async set(...args: Parameters<IncrementalCache['set']>) {
      return incrementalCache.set(...args)
    },

    async lock(...args: Parameters<IncrementalCache['lock']>) {
      return incrementalCache.lock(...args)
    },

    async unlock(...args: Parameters<IncrementalCache['unlock']>) {
      return incrementalCache.unlock(...args)
    },
  } as any)

  return {
    ipcPort,
    ipcValidationKey,
  }
}
