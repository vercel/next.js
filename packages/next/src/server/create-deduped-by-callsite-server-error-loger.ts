import * as React from 'react'

const errorRef: { current: null | string } = { current: null }
// We don't want to dedupe across requests.
// The developer might've just attempted to fix the warning so we should warn again if it still happens.
const flushCurrentErrorIfNew = React.cache(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- cache key
  (key: unknown) => {
    try {
      console.error(errorRef.current)
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
  getMessage: (...args: Args) => string
) {
  return function logDedupedError(...args: Args) {
    const message = getMessage(...args)

    if (process.env.NODE_ENV !== 'production') {
      const callStackFrames = new Error().stack?.split('\n')
      if (callStackFrames === undefined || callStackFrames.length < 4) {
        console.error(message)
      } else {
        // Error:
        //   logDedupedError
        //   asyncApiBeingAccessedSynchronously
        //   <userland callsite>
        // TODO: This breaks if sourcemaps with ignore lists are enabled.
        const key = callStackFrames[3]
        errorRef.current = message
        flushCurrentErrorIfNew(key)
      }
    } else {
      console.error(message)
    }
  }
}
