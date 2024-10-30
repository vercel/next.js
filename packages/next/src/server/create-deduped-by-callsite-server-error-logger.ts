import * as React from 'react'

const errorRef: { current: null | Error } = { current: null }

// React.cache is currently only available in canary/experimental React channels.
const cache =
  typeof React.cache === 'function'
    ? React.cache
    : (fn: (key: unknown) => void) => fn

// When Dynamic IO is enabled, we record these as errors so that they
// are captured by the dev overlay as it's more critical to fix these
// when enabled.
const logErrorOrWarn = process.env.__NEXT_DYNAMIC_IO
  ? console.error
  : console.warn

// We don't want to dedupe across requests.
// The developer might've just attempted to fix the warning so we should warn again if it still happens.
const flushCurrentErrorIfNew = cache(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- cache key
  (key: unknown) => {
    try {
      logErrorOrWarn(errorRef.current)
    } finally {
      errorRef.current = null
    }
  }
)

/**
 * Creates a function that logs an error message that is deduped by the userland
 * callsite.
 * This requires no indirection between the call of this function and the userland
 * callsite i.e. there's only a single library frame above this.
 * Do not use on the Client where sourcemaps and ignore listing might be enabled.
 * Only use that for warnings need a fix independent of the callstack.
 *
 * @param getMessage
 * @returns
 */
export function createDedupedByCallsiteServerErrorLoggerDev<Args extends any[]>(
  getMessage: (...args: Args) => Error
) {
  return function logDedupedError(...args: Args) {
    const message = getMessage(...args)

    if (process.env.NODE_ENV !== 'production') {
      const callStackFrames = new Error().stack?.split('\n')
      if (callStackFrames === undefined || callStackFrames.length < 4) {
        logErrorOrWarn(message)
      } else {
        // Error:
        //   logDedupedError
        //   asyncApiBeingAccessedSynchronously
        //   <userland callsite>
        // TODO: This breaks if sourcemaps with ignore lists are enabled.
        const key = callStackFrames[4]
        errorRef.current = message
        flushCurrentErrorIfNew(key)
      }
    } else {
      logErrorOrWarn(message)
    }
  }
}
