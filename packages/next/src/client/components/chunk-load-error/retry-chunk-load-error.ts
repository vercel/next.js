import { isChunkLoadError } from './is-chunk-load-error'
import {
  MAX_RETRY_ATTEMPTS,
  getRetryDelayMs,
  sleep,
} from './chunk-load-error-handler'

export function retryChunkLoadError<T>(load: () => Promise<T>): Promise<T> {
  let retries = 0

  const run = async (): Promise<T> => {
    try {
      return await load()
    } catch (err) {
      if (
        typeof window !== 'undefined' &&
        isChunkLoadError(err) &&
        retries < MAX_RETRY_ATTEMPTS
      ) {
        retries++
        await sleep(getRetryDelayMs())
        return run()
      }

      throw err
    }
  }

  return run()
}
