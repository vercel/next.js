import { isChunkLoadError } from './is-chunk-load-error'
import {
  MAX_RETRY_ATTEMPTS,
  getRetryDelayMs,
  sleep,
} from './chunk-load-error-handler'

const RETRY_EXHAUSTED = Symbol.for('next.chunk-load-error.retry-exhausted')

type RetryTaggedError = Error & {
  [RETRY_EXHAUSTED]?: true
}

function hasExhaustedChunkLoadRetry(error: unknown): error is RetryTaggedError {
  return !!(
    error &&
    typeof error === 'object' &&
    (error as RetryTaggedError)[RETRY_EXHAUSTED]
  )
}

function markExhaustedChunkLoadRetry(error: unknown) {
  if (!error || typeof error !== 'object') {
    return
  }

  try {
    ;(error as RetryTaggedError)[RETRY_EXHAUSTED] = true
  } catch {}
}

export function retryChunkLoadError<T>(load: () => Promise<T>): Promise<T> {
  let retries = 0

  const run = async (): Promise<T> => {
    try {
      return await load()
    } catch (err) {
      if (
        typeof window !== 'undefined' &&
        isChunkLoadError(err) &&
        !hasExhaustedChunkLoadRetry(err) &&
        retries < MAX_RETRY_ATTEMPTS
      ) {
        retries++
        await sleep(getRetryDelayMs())
        return run()
      }

      if (isChunkLoadError(err)) {
        markExhaustedChunkLoadRetry(err)
      }

      throw err
    }
  }

  return run()
}
