// @ts-nocheck
/* eslint-disable */
import * as nextError from 'next/error'

function inner(nextError) {
  // Local parameter shadows the namespace import; must NOT be rewritten.
  return nextError.unstable_catchError
}

export default nextError.catchError(Component)
